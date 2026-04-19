"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGraphQlServer = startGraphQlServer;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const server_1 = require("@apollo/server");
const standalone_1 = require("@apollo/server/standalone");
const subgraph_1 = require("@apollo/subgraph");
const graphql_tag_1 = __importDefault(require("graphql-tag"));
const db_1 = require("./db");
const config_1 = require("./config");
const s3_1 = require("./s3");
const typeDefs = (0, graphql_tag_1.default) `
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
    createListing(input: CreateListingInput!): Listing!
    updateListing(input: UpdateListingInput!): Listing!
    createBooking(input: CreateBookingInput!): BookingDeal!
    cancelBooking(id: ID!): Boolean!
  }
`;
function parseUserIdFromAuth(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer "))
        return null;
    try {
        const parsed = jsonwebtoken_1.default.verify(authHeader.slice(7), config_1.config.jwtSecret);
        return parsed.sub || null;
    }
    catch {
        return null;
    }
}
function toListing(row, photoIds = []) {
    const photoUrls = photoIds.map((photoId) => (0, s3_1.buildPhotoUrl)(photoId));
    return {
        id: row.id,
        ownerId: row.owner_id,
        title: row.name,
        description: row.description,
        price: Number(row.price),
        location: row.city,
        image: row.image_photo_id ? (0, s3_1.buildPhotoUrl)(row.image_photo_id) : photoUrls[0] || "https://placehold.co/600x400?text=Listing",
        photos: photoIds,
        type: row.type_name || "property",
        rooms: null,
        area: null,
        createdAt: row.created_at,
    };
}
async function loadListingPhotos(listingId) {
    const { rows } = await db_1.pool.query("SELECT photo_id FROM listing_photos WHERE listing_id = $1 ORDER BY id ASC", [listingId]);
    return rows.map((row) => row.photo_id);
}
async function loadListingById(listingId) {
    const { rows } = await db_1.pool.query(`SELECT l.id, l.owner_id, l.name, l.description, l.price, l.city, l.created_at, et.name AS type_name,
            (
              SELECT lp.photo_id
              FROM listing_photos lp
              WHERE lp.listing_id = l.id
              ORDER BY lp.id ASC
              LIMIT 1
            ) AS image_photo_id
       FROM listings l
       LEFT JOIN estate_types et ON et.id = l.type_id
       WHERE l.id = $1`, [listingId]);
    if (!rows.length)
        return null;
    const base = rows[0];
    const photos = await loadListingPhotos(base.id);
    return toListing(base, photos);
}
function toDeal(row) {
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
        __resolveReference: async (ref) => {
            return loadListingById(ref.id);
        },
    },
    BookingDeal: {
        __resolveReference: async (ref) => {
            const { rows } = await db_1.pool.query("SELECT id, listing_id, tenant_id, landlord_id, start_time, end_time, status FROM deals WHERE id = $1", [ref.id]);
            if (!rows.length)
                return null;
            return toDeal(rows[0]);
        },
    },
    User: {
        deals: async (user) => {
            const { rows } = await db_1.pool.query(`SELECT id, listing_id, tenant_id, landlord_id, start_time, end_time, status
         FROM deals WHERE tenant_id = $1 OR landlord_id = $1 ORDER BY created_at DESC`, [user.id]);
            return rows.map((row) => toDeal(row));
        },
        listings: async (user) => {
            const { rows } = await db_1.pool.query(`SELECT l.id, l.owner_id, l.name, l.description, l.price, l.city, l.created_at, et.name AS type_name
         FROM listings l
         LEFT JOIN estate_types et ON et.id = l.type_id
         WHERE owner_id = $1
         ORDER BY created_at DESC`, [user.id]);
            return rows.map((row) => toListing(row));
        },
    },
    Query: {
        listings: async () => {
            const { rows } = await db_1.pool.query(`SELECT l.id, l.owner_id, l.name, l.description, l.price, l.city, l.created_at, et.name AS type_name,
                (
                  SELECT lp.photo_id
                  FROM listing_photos lp
                  WHERE lp.listing_id = l.id
                  ORDER BY lp.id ASC
                  LIMIT 1
                ) AS image_photo_id
         FROM listings l
         LEFT JOIN estate_types et ON et.id = l.type_id
         ORDER BY l.created_at DESC LIMIT 100`);
            const mapped = await Promise.all(rows.map(async (row) => {
                const base = row;
                const photos = await loadListingPhotos(base.id);
                return toListing(base, photos);
            }));
            return mapped;
        },
        listing: async (_, args) => {
            return loadListingById(args.id);
        },
        bookingsByUser: async (_, args) => {
            const { rows } = await db_1.pool.query(`SELECT id, listing_id, tenant_id, landlord_id, start_time, end_time, status
         FROM deals WHERE tenant_id = $1 OR landlord_id = $1 ORDER BY created_at DESC`, [args.userId]);
            return rows.map((row) => toDeal(row));
        },
    },
    Mutation: {
        createListing: async (_, args, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            const typeId = args.input.typeId || 1;
            const photos = (0, s3_1.normalizePhotoIds)(args.input.photos);
            const client = await db_1.pool.connect();
            try {
                await client.query("BEGIN");
                const { rows } = await client.query(`INSERT INTO listings (owner_id, type_id, name, price, description, city, address)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`, [
                    ctx.userId,
                    typeId,
                    args.input.title,
                    args.input.price,
                    args.input.description || null,
                    args.input.location || null,
                    args.input.location || null,
                ]);
                const createdId = rows[0].id;
                for (const photoId of photos) {
                    await client.query("INSERT INTO listing_photos (listing_id, photo_id) VALUES ($1, $2)", [createdId, photoId]);
                }
                await client.query("COMMIT");
                const listing = await loadListingById(createdId);
                if (!listing)
                    throw new Error("failed to load listing");
                return listing;
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
            finally {
                client.release();
            }
        },
        updateListing: async (_, args, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            const { rows: ownerRows } = await db_1.pool.query("SELECT owner_id FROM listings WHERE id = $1", [args.input.id]);
            if (!ownerRows.length)
                throw new Error("listing not found");
            if (ownerRows[0].owner_id !== ctx.userId)
                throw new Error("forbidden");
            const current = await loadListingById(args.input.id);
            if (!current)
                throw new Error("listing not found");
            const title = args.input.title ?? current.title;
            const description = args.input.description ?? current.description;
            const price = args.input.price ?? current.price;
            const location = args.input.location ?? current.location;
            const typeId = args.input.typeId ?? 1;
            const client = await db_1.pool.connect();
            try {
                await client.query("BEGIN");
                await client.query(`UPDATE listings
           SET type_id = $1, name = $2, price = $3, description = $4, city = $5, address = $6
           WHERE id = $7`, [typeId, title, price, description || null, location || null, location || null, args.input.id]);
                if (Array.isArray(args.input.photos)) {
                    const photos = (0, s3_1.normalizePhotoIds)(args.input.photos);
                    await client.query("DELETE FROM listing_photos WHERE listing_id = $1", [args.input.id]);
                    for (const photoId of photos) {
                        await client.query("INSERT INTO listing_photos (listing_id, photo_id) VALUES ($1, $2)", [
                            args.input.id,
                            photoId,
                        ]);
                    }
                }
                await client.query("COMMIT");
            }
            catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
            finally {
                client.release();
            }
            const updated = await loadListingById(args.input.id);
            if (!updated)
                throw new Error("listing not found");
            return updated;
        },
        createBooking: async (_, args, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            const { rows: listingRows } = await db_1.pool.query("SELECT owner_id FROM listings WHERE id = $1", [args.input.listingId]);
            if (!listingRows.length)
                throw new Error("listing not found");
            const landlordId = listingRows[0].owner_id;
            const { rows } = await db_1.pool.query(`INSERT INTO deals (listing_id, landlord_id, tenant_id, start_time, end_time, status)
         VALUES ($1,$2,$3,$4,$5,'pending')
         RETURNING id, listing_id, tenant_id, landlord_id, start_time, end_time, status`, [args.input.listingId, landlordId, ctx.userId, args.input.startDate || null, args.input.endDate || null]);
            return toDeal(rows[0]);
        },
        cancelBooking: async (_, args, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            const { rowCount } = await db_1.pool.query(`UPDATE deals
         SET status = 'cancelled'
         WHERE id = $1 AND (tenant_id = $2 OR landlord_id = $2)`, [args.id, ctx.userId]);
            return (rowCount || 0) > 0;
        },
    },
};
async function startGraphQlServer() {
    const server = new server_1.ApolloServer({
        schema: (0, subgraph_1.buildSubgraphSchema)([{ typeDefs, resolvers }]),
    });
    await (0, standalone_1.startStandaloneServer)(server, {
        listen: { port: config_1.config.graphqlPort },
        context: async ({ req }) => ({
            userId: parseUserIdFromAuth(req.headers.authorization),
        }),
    });
    console.log(`rent-manager GraphQL listening on ${config_1.config.graphqlPort}`);
}
