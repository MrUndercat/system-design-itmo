import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from "@apollo/gateway";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import cors from "cors";
import express from "express";
import { config, readCorsAllowedOrigins } from "./config";

const ACCESS_COOKIE = "access_token";
const ALLOWED_ORIGINS = new Set(readCorsAllowedOrigins());

function readCookie(rawCookie: string | undefined, key: string): string | null {
  if (!rawCookie) return null;
  const chunks = rawCookie.split(";").map((part) => part.trim());
  for (const chunk of chunks) {
    if (!chunk.startsWith(`${key}=`)) continue;
    return decodeURIComponent(chunk.slice(key.length + 1));
  }
  return null;
}

function buildAuthCookie(token: string): string {
  return `${ACCESS_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`;
}

function clearAuthCookie(): string {
  return `${ACCESS_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

export async function startGateway(): Promise<void> {
  const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
      subgraphs: [
        { name: "users", url: `${config.userGraphQlUrl}/graphql` },
        { name: "rent", url: `${config.rentGraphQlUrl}/graphql` },
        { name: "communication", url: `${config.commGraphQlUrl}/graphql` },
      ],
    }),
    buildService({ url }) {
      return new RemoteGraphQLDataSource({
        url,
        willSendRequest({ request, context }) {
          if (context.authHeader) {
            request.http?.headers.set("authorization", context.authHeader);
          }
        },
      });
    },
  });

  const server = new ApolloServer({
    gateway,
    plugins: [
      {
        async requestDidStart() {
          return {
            async willSendResponse(requestContext) {
              const body = requestContext.response.body;
              if (body.kind !== "single") return;
              const payload = body.singleResult.data as Record<string, unknown> | undefined;
              const maybeLogin = payload?.login as { accessToken?: string } | undefined;
              const maybeLogout = payload?.logout as boolean | undefined;

              if (maybeLogin?.accessToken) {
                requestContext.response.http?.headers.set("set-cookie", buildAuthCookie(maybeLogin.accessToken));
              } else if (maybeLogout) {
                requestContext.response.http?.headers.set("set-cookie", clearAuthCookie());
              }
            },
          };
        },
      },
    ],
  });

  await server.start();

  const app = express();
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || ALLOWED_ORIGINS.has(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("origin is not allowed by CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "20mb" }));

  app.use(
    "/graphql",
    expressMiddleware(server, {
      context: async ({ req }) => {
        const cookieToken = readCookie(req.headers.cookie, ACCESS_COOKIE);
        return {
          authHeader: req.headers.authorization || (cookieToken ? `Bearer ${cookieToken}` : ""),
        };
      },
    })
  );
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.listen(config.port, () => {
    console.log(`gateway GraphQL listening on ${config.port}`);
  });
}
