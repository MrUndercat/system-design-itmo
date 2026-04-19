"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGraphQlServer = startGraphQlServer;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const server_1 = require("@apollo/server");
const standalone_1 = require("@apollo/server/standalone");
const subgraph_1 = require("@apollo/subgraph");
const graphql_tag_1 = __importDefault(require("graphql-tag"));
const db_1 = require("./db");
const config_1 = require("./config");
const typeDefs = (0, graphql_tag_1.default) `
  type User @key(fields: "id") {
    id: ID!
    email: String!
    name: String!
    type: String!
    createdAt: String
  }

  input RegisterInput {
    email: String!
    password: String!
    name: String
    phone: String
    type: String
  }

  type AuthPayload {
    accessToken: String!
    refreshToken: String!
    user: User!
  }

  type Query {
    user(id: ID!): User
    me: User
  }

  type Mutation {
    register(input: RegisterInput!): User!
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
  }
`;
function hashRefresh(token) {
    return crypto_1.default.createHash("sha256").update(token).digest("hex");
}
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
const resolvers = {
    User: {
        __resolveReference: async (ref) => {
            const { rows } = await db_1.pool.query("SELECT id, email, name, type, created_at FROM users WHERE id = $1", [ref.id]);
            if (!rows.length)
                return null;
            const u = rows[0];
            return {
                id: u.id,
                email: u.email,
                name: u.name,
                type: u.type,
                createdAt: u.created_at,
            };
        },
    },
    Query: {
        user: async (_, args) => {
            const { rows } = await db_1.pool.query("SELECT id, email, name, type, created_at FROM users WHERE id = $1", [args.id]);
            if (!rows.length)
                return null;
            const u = rows[0];
            return {
                id: u.id,
                email: u.email,
                name: u.name,
                type: u.type,
                createdAt: u.created_at,
            };
        },
        me: async (_, __, ctx) => {
            if (!ctx.userId)
                return null;
            const { rows } = await db_1.pool.query("SELECT id, email, name, type, created_at FROM users WHERE id = $1", [ctx.userId]);
            if (!rows.length)
                return null;
            const u = rows[0];
            return {
                id: u.id,
                email: u.email,
                name: u.name,
                type: u.type,
                createdAt: u.created_at,
            };
        },
    },
    Mutation: {
        register: async (_, args) => {
            const email = args.input.email?.trim();
            const password = args.input.password;
            const name = (args.input.name || email)?.trim();
            const phone = args.input.phone?.trim() || null;
            const type = args.input.type || "tenant";
            if (!email || !password || !name) {
                throw new Error("email, password and name are required");
            }
            const passwordHash = await bcryptjs_1.default.hash(password, 10);
            const { rows } = await db_1.pool.query(`INSERT INTO users (email, name, phone, password_hash, type)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, email, name, type, created_at`, [email, name, phone, passwordHash, type]);
            const u = rows[0];
            return {
                id: u.id,
                email: u.email,
                name: u.name,
                type: u.type,
                createdAt: u.created_at,
            };
        },
        login: async (_, args) => {
            const { rows } = await db_1.pool.query("SELECT id, email, name, type, password_hash, created_at FROM users WHERE email = $1", [args.email]);
            if (!rows.length)
                throw new Error("invalid credentials");
            const u = rows[0];
            const ok = await bcryptjs_1.default.compare(args.password, u.password_hash);
            if (!ok)
                throw new Error("invalid credentials");
            const accessToken = jsonwebtoken_1.default.sign({ sub: u.id, type: u.type, email: u.email }, config_1.config.jwtSecret, {
                expiresIn: config_1.config.accessTtl,
            });
            const refreshToken = crypto_1.default.randomBytes(32).toString("hex");
            const exp = new Date(Date.now() + config_1.config.refreshTtl * 1000);
            await db_1.pool.query(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1,$2,$3)`, [u.id, hashRefresh(refreshToken), exp]);
            return {
                accessToken,
                refreshToken,
                user: {
                    id: u.id,
                    email: u.email,
                    name: u.name,
                    type: u.type,
                    createdAt: u.created_at,
                },
            };
        },
        logout: async (_, __, ctx) => {
            if (!ctx.userId) {
                return false;
            }
            await db_1.pool.query(`UPDATE refresh_tokens
         SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`, [ctx.userId]);
            return true;
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
    console.log(`user-manager GraphQL listening on ${config_1.config.graphqlPort}`);
}
