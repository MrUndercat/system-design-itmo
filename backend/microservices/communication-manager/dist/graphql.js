"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGraphQlServer = startGraphQlServer;
const server_1 = require("@apollo/server");
const standalone_1 = require("@apollo/server/standalone");
const subgraph_1 = require("@apollo/subgraph");
const graphql_tag_1 = __importDefault(require("graphql-tag"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("./db");
const config_1 = require("./config");
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
const typeDefs = (0, graphql_tag_1.default) `
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
  }
`;
function toChat(row) {
    return {
        id: row.id,
        userAId: row.user_a_id,
        userBId: row.user_b_id,
        listingId: row.listing_id,
        dealId: row.deal_id,
        createdAt: row.created_at,
    };
}
function toMessage(row) {
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
function toReview(row) {
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
        __resolveReference: async (ref) => {
            const { rows } = await db_1.pool.query("SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at FROM chats WHERE id = $1", [ref.id]);
            if (!rows.length)
                return null;
            return toChat(rows[0]);
        },
    },
    Message: {
        __resolveReference: async (ref) => {
            const { rows } = await db_1.pool.query("SELECT id, chat_id, sender_id, text, status, edited, created_at FROM messages WHERE id = $1", [ref.id]);
            if (!rows.length)
                return null;
            return toMessage(rows[0]);
        },
    },
    Review: {
        __resolveReference: async (ref) => {
            const { rows } = await db_1.pool.query("SELECT id, target_id, author_id, rating, text, created_at FROM reviews WHERE id = $1", [ref.id]);
            if (!rows.length)
                return null;
            return toReview(rows[0]);
        },
    },
    User: {
        reviews: async (user) => {
            const { rows } = await db_1.pool.query("SELECT id, target_id, author_id, rating, text, created_at FROM reviews WHERE target_id = $1 ORDER BY created_at DESC", [user.id]);
            return rows.map((row) => toReview(row));
        },
    },
    Query: {
        myChats: async (_, __, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            const { rows } = await db_1.pool.query(`SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at
         FROM chats WHERE user_a_id = $1 OR user_b_id = $1
         ORDER BY created_at DESC`, [ctx.userId]);
            return rows.map((row) => toChat(row));
        },
        chatMessages: async (_, args, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            const { rows: chatRows } = await db_1.pool.query("SELECT user_a_id, user_b_id FROM chats WHERE id = $1", [args.chatId]);
            if (!chatRows.length)
                throw new Error("chat not found");
            const chat = chatRows[0];
            if (chat.user_a_id !== ctx.userId && chat.user_b_id !== ctx.userId) {
                throw new Error("forbidden");
            }
            const { rows } = await db_1.pool.query(`SELECT id, chat_id, sender_id, text, status, edited, created_at
         FROM messages WHERE chat_id = $1 ORDER BY created_at ASC`, [args.chatId]);
            return rows.map((row) => toMessage(row));
        },
        reviewsByUser: async (_, args) => {
            const { rows } = await db_1.pool.query("SELECT id, target_id, author_id, rating, text, created_at FROM reviews WHERE target_id = $1 ORDER BY created_at DESC", [args.userId]);
            return rows.map((row) => toReview(row));
        },
        reviewsByListing: async (_, args) => {
            const { rows } = await db_1.pool.query(`SELECT id, target_id, author_id, rating, text, created_at
         FROM reviews WHERE listing_id = $1 ORDER BY created_at DESC`, [args.listingId]);
            return rows.map((row) => toReview(row));
        },
    },
    Mutation: {
        createOrGetChat: async (_, args, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            if (!args.otherUserId)
                throw new Error("otherUserId is required");
            if (args.otherUserId === ctx.userId)
                throw new Error("cannot chat with self");
            const userAId = ctx.userId < args.otherUserId ? ctx.userId : args.otherUserId;
            const userBId = ctx.userId < args.otherUserId ? args.otherUserId : ctx.userId;
            const { rows: existingExact } = await db_1.pool.query(`SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at
         FROM chats
         WHERE user_a_id = $1 AND user_b_id = $2 AND (
           ($3::uuid IS NULL AND listing_id IS NULL) OR listing_id = $3::uuid
         )
         ORDER BY created_at DESC
         LIMIT 1`, [userAId, userBId, args.listingId || null]);
            if (existingExact.length)
                return toChat(existingExact[0]);
            const { rows: existingAny } = await db_1.pool.query(`SELECT id, user_a_id, user_b_id, listing_id, deal_id, created_at
         FROM chats
         WHERE user_a_id = $1 AND user_b_id = $2
         ORDER BY created_at DESC
         LIMIT 1`, [userAId, userBId]);
            if (existingAny.length)
                return toChat(existingAny[0]);
            const { rows } = await db_1.pool.query(`INSERT INTO chats (user_a_id, user_b_id, listing_id, deal_id)
         VALUES ($1, $2, $3, NULL)
         RETURNING id, user_a_id, user_b_id, listing_id, deal_id, created_at`, [userAId, userBId, args.listingId || null]);
            return toChat(rows[0]);
        },
        sendMessage: async (_, args, ctx) => {
            if (!ctx.userId)
                throw new Error("unauthorized");
            if (!args.text.trim())
                throw new Error("text is required");
            const { rows: chatRows } = await db_1.pool.query("SELECT user_a_id, user_b_id FROM chats WHERE id = $1", [args.chatId]);
            if (!chatRows.length)
                throw new Error("chat not found");
            const chat = chatRows[0];
            if (chat.user_a_id !== ctx.userId && chat.user_b_id !== ctx.userId) {
                throw new Error("forbidden");
            }
            const { rows } = await db_1.pool.query(`INSERT INTO messages (chat_id, sender_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, chat_id, sender_id, text, status, edited, created_at`, [args.chatId, ctx.userId, args.text.trim()]);
            return toMessage(rows[0]);
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
    console.log(`communication-manager GraphQL listening on ${config_1.config.graphqlPort}`);
}
