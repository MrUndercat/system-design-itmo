import jwt from "jsonwebtoken";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import gql from "graphql-tag";
import { pool } from "./db";
import { config } from "./config";
import { buildPhotoUrl, normalizePhotoIds, uploadListingPhoto } from "./s3";

type TokenPayload = { sub: string };

type GraphQlContext = {
  userId: string | null;
};

const typeDefs = gql`
  extend type User @key(fields: "id") {
    id: ID! @external
    deals: [BookingDeal!]!
    listings: [Listing!]!
  }

  type Listing @key(fields: "id") {
    id: ID!
    ownerId: ID!
    title: String!
    description: String
    price: Float!
    location: String
    image: String
    photos: [String!]!
    type: String
    rooms: Int
    area: Int
    createdAt: String
  }

  type BookingDeal @key(fields: "id") {
    id: ID!
    listingId: ID!
    tenantId: ID!
    landlordId: ID!
    startDate: String
    endDate: String
    status: String!
  }

  input CreateBookingInput {
    listingId: ID!
    startDate: String
    endDate: String
  }

  input CreateListingInput {
    title: String!
    description: String
    price: Float!
    location: String
    typeId: Int
    photos: [String!]
  }

  input UpdateListingInput {
    id: ID!
    title: String
    description: String
    price: Float
    location: String
    typeId: Int
    photos: [String!]
  }

  type Query {
    listings: [Listing!]!
    listing(id: ID!): Listing
    bookingsByUser(userId: ID!): [BookingDeal!]!
  }

  type Mutation {
    uploadListingPhoto(base64: String!, contentType: String): String!
    createListing(input: CreateListingInput!): Listing!
    updateListing(input: UpdateListingInput!): Listing!
    createBooking(input: CreateBookingInput!): BookingDeal!
    cancelBooking(id: ID!): Boolean!
  }
`;

function parseUserIdFromAuth(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const parsed = jwt.verify(authHeader.slice(7), config.jwtSecret) as TokenPayload;
    return parsed.sub || null;
  } catch {
    return null;
  }
}

type DbListing = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  price: string | number;
  city: string | null;
  created_at: string;
  type_name: string | null;
  image_photo_id?: string | null;
};

function toListing(row: DbListing, photoIds: string[] = []) {
  const photoUrls = photoIds.map((photoId) => buildPhotoUrl(photoId));
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.name,
    description: row.description,
    price: Number(row.price),
    location: row.city,
    image: row.image_photo_id ? buildPhotoUrl(row.image_photo_id) : photoUrls[0] || "https://placehold.co/600x400?text=Listing",
    photos: photoUrls,
    type: row.type_name || "property",
    rooms: null,
    area: null,
    createdAt: row.created_at,
  };
}

async function loadListingPhotos(listingId: string): Promise<string[]> {
  const { rows } = await pool.query<{ photo_id: string }>(
    "SELECT photo_id FROM listing_photos WHERE listing_id = $1 ORDER BY id ASC",
    [listingId]
  );
  return rows.map((row) => row.photo_id);
}

async function loadListingById(listingId: string): Promise<ReturnType<typeof toListing> | null> {
  const { rows } = await pool.query(
    `SELECT l.id, l.owner_id, l.name, l.description, l.price, l.city, l.created_at, et.name AS type_name,
            (
              SELECT lp.photo_id
              FROM listing_photos lp
              WHERE lp.listing_id = l.id
              ORDER BY lp.id ASC
              LIMIT 1
            ) AS image_photo_id
       FROM listings l
       LEFT JOIN estate_types et ON et.id = l.type_id
       WHERE l.id = $1`,
    [listingId]
  );
  if (!rows.length) return null;
  const base = rows[0] as DbListing;
  const photos = await loadListingPhotos(base.id);
  return toListing(base, photos);
}

type DbDeal = {
  id: string;
  listing_id: string;
  tenant_id: string;
  landlord_id: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
};

function toDeal(row: DbDeal) {
  return {
    id: row.id,
    listingId: row.listing_id,
    tenantId: row.tenant_id,
    landlordId: row.landlord_id,
    startDate: row.start_time,
    endDate: row.end_time,
    status: row.status,
  };
}

const resolvers = {
  Listing: {
    __resolveReference: async (ref: { id: string }) => {
      return loadListingById(ref.id);
    },
  },
  BookingDeal: {
    __resolveReference: async (ref: { id: string }) => {
      const { rows } = await pool.query(
        "SELECT id, listing_id, tenant_id, landlord_id, start_time, end_time, status FROM deals WHERE id = $1",
        [ref.id]
      );
      if (!rows.length) return null;
      return toDeal(rows[0] as DbDeal);
    },
  },
  User: {
    deals: async (user: { id: string }) => {
      const { rows } = await pool.query(
        `SELECT id, listing_id, tenant_id, landlord_id, start_time, end_time, status
         FROM deals WHERE tenant_id = $1 OR landlord_id = $1 ORDER BY created_at DESC`,
        [user.id]
      );
      return rows.map((row) => toDeal(row as DbDeal));
    },
    listings: async (user: { id: string }) => {
      const { rows } = await pool.query(
        `SELECT l.id, l.owner_id, l.name, l.description, l.price, l.city, l.created_at, et.name AS type_name
         FROM listings l
         LEFT JOIN estate_types et ON et.id = l.type_id
         WHERE owner_id = $1
         ORDER BY created_at DESC`,
        [user.id]
      );
      return rows.map((row) => toListing(row as DbListing));
    },
  },
  Query: {
    listings: async () => {
      const { rows } = await pool.query(
        `SELECT l.id, l.owner_id, l.name, l.description, l.price, l.city, l.created_at, et.name AS type_name,
                (
                  SELECT lp.photo_id
                  FROM listing_photos lp
                  WHERE lp.listing_id = l.id
                  ORDER BY lp.id ASC
                  LIMIT 1
                ) AS image_photo_id
         FROM listings l
         LEFT JOIN estate_types et ON et.id = l.type_id
         ORDER BY l.created_at DESC LIMIT 100`
      );
      const mapped = await Promise.all(
        rows.map(async (row) => {
          const base = row as DbListing;
          const photos = await loadListingPhotos(base.id);
          return toListing(base, photos);
        })
      );
      return mapped;
    },
    listing: async (_: unknown, args: { id: string }) => {
      return loadListingById(args.id);
    },
    bookingsByUser: async (_: unknown, args: { userId: string }) => {
      const { rows } = await pool.query(
        `SELECT id, listing_id, tenant_id, landlord_id, start_time, end_time, status
         FROM deals WHERE tenant_id = $1 OR landlord_id = $1 ORDER BY created_at DESC`,
        [args.userId]
      );
      return rows.map((row) => toDeal(row as DbDeal));
    },
  },
  Mutation: {
    uploadListingPhoto: async (
      _: unknown,
      args: { base64: string; contentType?: string },
      ctx: GraphQlContext
    ) => {
      if (!ctx.userId) throw new Error("unauthorized");
      const raw = (args.base64 || "").trim();
      if (!raw) throw new Error("base64 is required");

      const dataPart = raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
      let data: Buffer;
      try {
        data = Buffer.from(dataPart, "base64");
      } catch {
        throw new Error("invalid base64 payload");
      }
      if (!data.length) throw new Error("empty file");
      if (data.length > 10 * 1024 * 1024) throw new Error("file too large");

      return uploadListingPhoto({ data, contentType: args.contentType });
    },
    createListing: async (
      _: unknown,
      args: {
        input: {
          title: string;
          description?: string;
          price: number;
          location?: string;
          typeId?: number;
          photos?: string[];
        };
      },
      ctx: GraphQlContext
    ) => {
      if (!ctx.userId) throw new Error("unauthorized");
      const typeId = args.input.typeId || 1;
      const photos = normalizePhotoIds(args.input.photos);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `INSERT INTO listings (owner_id, type_id, name, price, description, city, address)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [
            ctx.userId,
            typeId,
            args.input.title,
            args.input.price,
            args.input.description || null,
            args.input.location || null,
            args.input.location || null,
          ]
        );
        const createdId = (rows[0] as { id: string }).id;
        for (const photoId of photos) {
          await client.query("INSERT INTO listing_photos (listing_id, photo_id) VALUES ($1, $2)", [createdId, photoId]);
        }
        await client.query("COMMIT");
        const listing = await loadListingById(createdId);
        if (!listing) throw new Error("failed to load listing");
        return listing;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
    updateListing: async (
      _: unknown,
      args: {
        input: {
          id: string;
          title?: string;
          description?: string;
          price?: number;
          location?: string;
          typeId?: number;
          photos?: string[];
        };
      },
      ctx: GraphQlContext
    ) => {
      if (!ctx.userId) throw new Error("unauthorized");
      const { rows: ownerRows } = await pool.query<{ owner_id: string }>(
        "SELECT owner_id FROM listings WHERE id = $1",
        [args.input.id]
      );
      if (!ownerRows.length) throw new Error("listing not found");
      if (ownerRows[0].owner_id !== ctx.userId) throw new Error("forbidden");

      const current = await loadListingById(args.input.id);
      if (!current) throw new Error("listing not found");

      const title = args.input.title ?? current.title;
      const description = args.input.description ?? current.description;
      const price = args.input.price ?? current.price;
      const location = args.input.location ?? current.location;
      const typeId = args.input.typeId ?? 1;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE listings
           SET type_id = $1, name = $2, price = $3, description = $4, city = $5, address = $6
           WHERE id = $7`,
          [typeId, title, price, description || null, location || null, location || null, args.input.id]
        );
        if (Array.isArray(args.input.photos)) {
          const photos = normalizePhotoIds(args.input.photos);
          await client.query("DELETE FROM listing_photos WHERE listing_id = $1", [args.input.id]);
          for (const photoId of photos) {
            await client.query("INSERT INTO listing_photos (listing_id, photo_id) VALUES ($1, $2)", [args.input.id, photoId]);
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      const updated = await loadListingById(args.input.id);
      if (!updated) throw new Error("listing not found");
      return updated;
    },
    createBooking: async (_: unknown, args: { input: { listingId: string; startDate?: string; endDate?: string } }, ctx: GraphQlContext) => {
      if (!ctx.userId) throw new Error("unauthorized");
      const { rows: listingRows } = await pool.query<{ owner_id: string }>(
        "SELECT owner_id FROM listings WHERE id = $1",
        [args.input.listingId]
      );
      if (!listingRows.length) throw new Error("listing not found");

      const landlordId = listingRows[0].owner_id;
      const { rows } = await pool.query(
        `INSERT INTO deals (listing_id, landlord_id, tenant_id, start_time, end_time, status)
         VALUES ($1,$2,$3,$4,$5,'pending')
         RETURNING id, listing_id, tenant_id, landlord_id, start_time, end_time, status`,
        [args.input.listingId, landlordId, ctx.userId, args.input.startDate || null, args.input.endDate || null]
      );
      return toDeal(rows[0] as DbDeal);
    },
    cancelBooking: async (_: unknown, args: { id: string }, ctx: GraphQlContext) => {
      if (!ctx.userId) throw new Error("unauthorized");
      const { rowCount } = await pool.query(
        `UPDATE deals
         SET status = 'cancelled'
         WHERE id = $1 AND (tenant_id = $2 OR landlord_id = $2)`,
        [args.id, ctx.userId]
      );
      return (rowCount || 0) > 0;
    },
  },
};

export async function startGraphQlServer(): Promise<void> {
  const server = new ApolloServer({
    schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
  });
  await startStandaloneServer(server, {
    listen: { port: config.graphqlPort },
    context: async ({ req }) => ({
      userId: parseUserIdFromAuth(req.headers.authorization),
    }),
  });
  console.log(`rent-manager GraphQL listening on ${config.graphqlPort}`);
}
