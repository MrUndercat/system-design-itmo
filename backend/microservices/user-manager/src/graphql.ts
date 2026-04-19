import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import gql from "graphql-tag";
import { pool } from "./db";
import { config } from "./config";

type JwtPayload = { sub: string };

type GraphQlContext = {
  userId: string | null;
};

const typeDefs = gql`
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

function hashRefresh(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseUserIdFromAuth(authHeader?: string): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const parsed = jwt.verify(authHeader.slice(7), config.jwtSecret) as JwtPayload;
    return parsed.sub || null;
  } catch {
    return null;
  }
}

const resolvers = {
  User: {
    __resolveReference: async (ref: { id: string }) => {
      const { rows } = await pool.query(
        "SELECT id, email, name, type, created_at FROM users WHERE id = $1",
        [ref.id]
      );
      if (!rows.length) return null;
      const u = rows[0] as {
        id: string;
        email: string;
        name: string;
        type: string;
        created_at: string;
      };
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
    user: async (_: unknown, args: { id: string }) => {
      const { rows } = await pool.query(
        "SELECT id, email, name, type, created_at FROM users WHERE id = $1",
        [args.id]
      );
      if (!rows.length) return null;
      const u = rows[0] as {
        id: string;
        email: string;
        name: string;
        type: string;
        created_at: string;
      };
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        type: u.type,
        createdAt: u.created_at,
      };
    },
    me: async (_: unknown, __: unknown, ctx: GraphQlContext) => {
      if (!ctx.userId) return null;
      const { rows } = await pool.query(
        "SELECT id, email, name, type, created_at FROM users WHERE id = $1",
        [ctx.userId]
      );
      if (!rows.length) return null;
      const u = rows[0] as {
        id: string;
        email: string;
        name: string;
        type: string;
        created_at: string;
      };
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
    register: async (_: unknown, args: { input: Record<string, string> }) => {
      const email = args.input.email?.trim();
      const password = args.input.password;
      const name = (args.input.name || email)?.trim();
      const phone = args.input.phone?.trim() || null;
      const type = args.input.type || "tenant";

      if (!email || !password || !name) {
        throw new Error("email, password and name are required");
      }

      const passwordHash = await bcrypt.hash(password, 10);
      try {
        const { rows } = await pool.query(
          `INSERT INTO users (email, name, phone, password_hash, type)
           VALUES ($1,$2,$3,$4,$5)
           RETURNING id, email, name, type, created_at`,
          [email, name, phone, passwordHash, type]
        );
        const u = rows[0] as {
          id: string;
          email: string;
          name: string;
          type: string;
          created_at: string;
        };
        return {
          id: u.id,
          email: u.email,
          name: u.name,
          type: u.type,
          createdAt: u.created_at,
        };
      } catch (e: unknown) {
        const err = e as { code?: string; constraint?: string; message?: string };
        if (err.code === "23505" || err.message?.includes("users_email_key")) {
          throw new Error("юзер уже существует");
        }
        throw e;
      }
    },
    login: async (_: unknown, args: { email: string; password: string }) => {
      const { rows } = await pool.query(
        "SELECT id, email, name, type, password_hash, created_at FROM users WHERE email = $1",
        [args.email]
      );
      if (!rows.length) throw new Error("invalid credentials");
      const u = rows[0] as {
        id: string;
        email: string;
        name: string;
        type: string;
        password_hash: string;
        created_at: string;
      };
      const ok = await bcrypt.compare(args.password, u.password_hash);
      if (!ok) throw new Error("invalid credentials");

      const accessToken = jwt.sign({ sub: u.id, type: u.type, email: u.email }, config.jwtSecret, {
        expiresIn: config.accessTtl,
      });
      const refreshToken = crypto.randomBytes(32).toString("hex");
      const exp = new Date(Date.now() + config.refreshTtl * 1000);
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1,$2,$3)`,
        [u.id, hashRefresh(refreshToken), exp]
      );

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
    logout: async (_: unknown, __: unknown, ctx: GraphQlContext) => {
      if (!ctx.userId) {
        return false;
      }
      await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [ctx.userId]
      );
      return true;
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

  console.log(`user-manager GraphQL listening on ${config.graphqlPort}`);
}
