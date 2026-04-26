"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startGateway = startGateway;
const gateway_1 = require("@apollo/gateway");
const server_1 = require("@apollo/server");
const express4_1 = require("@as-integrations/express4");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const config_1 = require("./config");
const ACCESS_COOKIE = "access_token";
const ALLOWED_ORIGINS = new Set((0, config_1.readCorsAllowedOrigins)());
function readCookie(rawCookie, key) {
    if (!rawCookie)
        return null;
    const chunks = rawCookie.split(";").map((part) => part.trim());
    for (const chunk of chunks) {
        if (!chunk.startsWith(`${key}=`))
            continue;
        return decodeURIComponent(chunk.slice(key.length + 1));
    }
    return null;
}
function buildAuthCookie(token) {
    return `${ACCESS_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`;
}
function clearAuthCookie() {
    return `${ACCESS_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
async function startGateway() {
    const gateway = new gateway_1.ApolloGateway({
        supergraphSdl: new gateway_1.IntrospectAndCompose({
            subgraphs: [
                { name: "users", url: `${config_1.config.userGraphQlUrl}/graphql` },
                { name: "rent", url: `${config_1.config.rentGraphQlUrl}/graphql` },
                { name: "communication", url: `${config_1.config.commGraphQlUrl}/graphql` },
            ],
        }),
        buildService({ url }) {
            return new gateway_1.RemoteGraphQLDataSource({
                url,
                willSendRequest({ request, context }) {
                    if (context.authHeader) {
                        request.http?.headers.set("authorization", context.authHeader);
                    }
                },
            });
        },
    });
    const server = new server_1.ApolloServer({
        gateway,
        plugins: [
            {
                async requestDidStart() {
                    return {
                        async willSendResponse(requestContext) {
                            const body = requestContext.response.body;
                            if (body.kind !== "single")
                                return;
                            const payload = body.singleResult.data;
                            const maybeLogin = payload?.login;
                            const maybeLogout = payload?.logout;
                            if (maybeLogin?.accessToken) {
                                requestContext.response.http?.headers.set("set-cookie", buildAuthCookie(maybeLogin.accessToken));
                            }
                            else if (maybeLogout) {
                                requestContext.response.http?.headers.set("set-cookie", clearAuthCookie());
                            }
                        },
                    };
                },
            },
        ],
    });
    await server.start();
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({
        origin(origin, callback) {
            if (!origin || ALLOWED_ORIGINS.has(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("origin is not allowed by CORS"));
        },
        credentials: true,
    }));
    app.use(express_1.default.json({ limit: "20mb" }));
    app.use("/graphql", (0, express4_1.expressMiddleware)(server, {
        context: async ({ req }) => {
            const cookieToken = readCookie(req.headers.cookie, ACCESS_COOKIE);
            return {
                authHeader: req.headers.authorization || (cookieToken ? `Bearer ${cookieToken}` : ""),
            };
        },
    }));
    app.get("/health", (_req, res) => {
        res.status(200).json({ status: "ok" });
    });
    app.listen(config_1.config.port, () => {
        console.log(`gateway GraphQL listening on ${config_1.config.port}`);
    });
}
