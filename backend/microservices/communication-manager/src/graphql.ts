import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import gql from "graphql-tag";
import jwt from "jsonwebtoken";
import { pool } from "./db";
import { config } from "./config";
import { assertUsersExist } from "./clients/user-manager";
import { assertListingExists } from "./clients/rent-manager";

type TokenPayload = { sub: string };

type GraphQlContext = {
  userId: string | null;
  authHeader: string;
};

function parseUserIdFromAuth(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const parsed = jwt.verify(authHeader.slice(7), config.jwtSecret) as TokenPayload;
    return parsed.sub || null;
  } catch {
    return null;
  }
}

const typeDefs = gql`
  type Chat @key(fields: "id") {
    id: ID!
    userAId: ID!
    userBId: ID!
    listingId: ID
    dealId: ID
    createdAt: String
  }

  type Message @key(fields: "id") {
    id: ID!
    chatId: ID!
    senderId: ID!
    text: String!
    status: String!
    edited: Boolean!
    createdAt: String
  }

  type Review @key(fields: "id") {
    id: ID!
    userId: ID!
    authorId: ID!
    rating: Int!
    text: String
    createdAt: String
  }

  extend type User @key(fields: "id") {
    id: ID! @external
    reviews: [Review!]!
  }

  type Query {
    myChats: [Chat!]!
    chatMessages(chatId: ID!): [Message!]!
    reviewsByUser(userId: ID!): [Review!]!
    reviewsByListing(listingId: ID!): [Review!]!
  }

  type Mutation {
    createOrGetChat(otherUserId: ID!, listingId: ID): Chat!
    sendMessage(chatId: ID!, text: String!): Message!
    createReview(targetId: ID!, listingId: ID!, rating: Int!, text: String): Review!
  }
`;

type DbChat = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  listing_id: string | null;
  deal_id: string | null;
  created_at: string;
};

function toChat(row: DbChat) {
  return {
    id: row.id,
    userAId: row.user_a_id,
    userBId: row.user_b_id,
    listingId: row.listing_id,
    dealId: row.deal_id,
    createdAt: row.created_at,
  };
}

type DbMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  status: string;
  edited: boolean;
  created_at: string;
};

function toMessage(row: DbMessage) {
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    text: row.text,
    status: row.status,
    edited: row.edited,
    createdAt: row.created_at,
  };
}

type DbReview = {
  id: string;
  target_id: string;
  author_id: string;
  rating: number;
  text: string | null;
  created_at: string;
};

function toReview(row: DbReview) {
  return {
    id: row.id,
    userId: row.target_id,
    authorId: row.author_id,
    rating: row.rating,
    text: row.text,
    createdAt: row.created_at,
  };
}

const resolvers = {
  Chat: {
    __resolveReference: async (ref: { id: string }) => {
      const { rows } = await pool.query(
        "SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at FROM chats WHERE id = $1",
        [ref.id]
      );
      if (!rows.length) return null;
      return toChat(rows[0] as DbChat);
    },
  },
  Message: {
    __resolveReference: async (ref: { id: string }) => {
      const { rows } = await pool.query(
        "SELECT id, chat_id, sender_id, text, status, edited, created_at FROM messages WHERE id = $1",
        [ref.id]
      );
      if (!rows.length) return null;
      return toMessage(rows[0] as DbMessage);
    },
  },
  Review: {
    __resolveReference: async (ref: { id: string }) => {
      const { rows } = await pool.query(
        "SELECT id, target_id, author_id, rating, text, created_at FROM reviews WHERE id = $1",
        [ref.id]
      );
      if (!rows.length) return null;
      return toReview(rows[0] as DbReview);
    },
  },
  User: {
    reviews: async (user: { id: string }) => {
      const { rows } = await pool.query(
        "SELECT id, target_id, author_id, rating, text, created_at FROM reviews WHERE target_id = $1 ORDER BY created_at DESC",
        [user.id]
      );
      return rows.map((row) => toReview(row as DbReview));
    },
  },
  Query: {
    myChats: async (_: unknown, __: unknown, ctx: GraphQlContext) => {
      if (!ctx.userId) throw new Error("unauthorized");
      const { rows } = await pool.query(
        `SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at
         FROM chats WHERE user_a_id = $1 OR user_b_id = $1
         ORDER BY created_at DESC`,
        [ctx.userId]
      );
      return rows.map((row) => toChat(row as DbChat));
    },
    chatMessages: async (_: unknown, args: { chatId: string }, ctx: GraphQlContext) => {
      if (!ctx.userId) throw new Error("unauthorized");
      const { rows: chatRows } = await pool.query<{ user_a_id: string; user_b_id: string }>(
        "SELECT user_a_id, user_b_id FROM chats WHERE id = $1",
        [args.chatId]
      );
      if (!chatRows.length) throw new Error("chat not found");
      const chat = chatRows[0];
      if (chat.user_a_id !== ctx.userId && chat.user_b_id !== ctx.userId) {
        throw new Error("forbidden");
      }
      const { rows } = await pool.query(
        `SELECT id, chat_id, sender_id, text, status, edited, created_at
         FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`,
        [args.chatId]
      );
      return rows.map((row) => toMessage(row as DbMessage));
    },
    reviewsByUser: async (_: unknown, args: { userId: string }) => {
      const { rows } = await pool.query(
        "SELECT id, target_id, author_id, rating, text, created_at FROM reviews WHERE target_id = $1 ORDER BY created_at DESC",
        [args.userId]
      );
      return rows.map((row) => toReview(row as DbReview));
    },
    reviewsByListing: async (_: unknown, args: { listingId: string }) => {
      const { rows } = await pool.query(
        `SELECT id, target_id, author_id, rating, text, created_at
         FROM reviews WHERE listing_id = $1 ORDER BY created_at DESC`,
        [args.listingId]
      );
      return rows.map((row) => toReview(row as DbReview));
    },
  },
  Mutation: {
    createOrGetChat: async (
      _: unknown,
      args: { otherUserId: string; listingId?: string | null },
      ctx: GraphQlContext
    ) => {
      if (!ctx.userId) throw new Error("unauthorized");
      if (!args.otherUserId) throw new Error("otherUserId is required");
      if (args.otherUserId === ctx.userId) throw new Error("cannot chat with self");

      const userAId = ctx.userId < args.otherUserId ? ctx.userId : args.otherUserId;
      const userBId = ctx.userId < args.otherUserId ? args.otherUserId : ctx.userId;

      const { rows: existingExact } = await pool.query(
        `SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at
         FROM chats
         WHERE user_a_id = $1 AND user_b_id = $2 AND (
           ($3::uuid IS NULL AND listing_id IS NULL) OR listing_id = $3::uuid
         )
         ORDER BY created_at DESC
         LIMIT 1`,
        [userAId, userBId, args.listingId || null]
      );
      if (existingExact.length) return toChat(existingExact[0] as DbChat);

      const { rows: existingAny } = await pool.query(
        `SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at
         FROM chats
         WHERE user_a_id = $1 AND user_b_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [userAId, userBId]
      );
      if (existingAny.length) return toChat(existingAny[0] as DbChat);

      const { rows } = await pool.query(
        `INSERT INTO chats (user_a_id, user_b_id, listing_id, deal_id)
         VALUES ($1, $2, $3, NULL)
         RETURNING id, user_a_id, user_b_id, listing_id, deal_id, created_at`,
        [userAId, userBId, args.listingId || null]
      );
      return toChat(rows[0] as DbChat);
    },
    sendMessage: async (_: unknown, args: { chatId: string; text: string }, ctx: GraphQlContext) => {
      if (!ctx.userId) throw new Error("unauthorized");
      if (!args.text.trim()) throw new Error("text is required");
      const { rows: chatRows } = await pool.query<{ user_a_id: string; user_b_id: string }>(
        "SELECT user_a_id, user_b_id FROM chats WHERE id = $1",
        [args.chatId]
      );
      if (!chatRows.length) throw new Error("chat not found");
      const chat = chatRows[0];
      if (chat.user_a_id !== ctx.userId && chat.user_b_id !== ctx.userId) {
        throw new Error("forbidden");
      }
      const { rows } = await pool.query(
        `INSERT INTO messages (chat_id, sender_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, chat_id, sender_id, text, status, edited, created_at`,
        [args.chatId, ctx.userId, args.text.trim()]
      );
      return toMessage(rows[0] as DbMessage);
    },
    createReview: async (
      _: unknown,
      args: { targetId: string; listingId: string; rating: number; text?: string | null },
      ctx: GraphQlContext
    ) => {
      if (!ctx.userId) throw new Error("unauthorized");
      if (args.targetId === ctx.userId) throw new Error("cannot review self");
      if (!args.listingId) throw new Error("listingId is required");
      if (args.rating < 1 || args.rating > 5) throw new Error("rating must be between 1 and 5");

      const usersOk = await assertUsersExist([ctx.userId, args.targetId]);
      if (!usersOk) throw new Error("user not found");

      const listingOk = await assertListingExists(args.listingId);
      if (!listingOk) throw new Error("listing not found");

      const { rows } = await pool.query(
        `INSERT INTO reviews (author_id, target_id, rating, text, listing_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, target_id, author_id, rating, text, created_at`,
        [ctx.userId, args.targetId, args.rating, args.text?.trim() || null, args.listingId]
      );
      return toReview(rows[0] as DbReview);
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
      authHeader: req.headers.authorization || "",
    }),
  });
  console.log(`communication-manager GraphQL listening on ${config.graphqlPort}`);
}
