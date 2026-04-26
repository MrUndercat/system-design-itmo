"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
function readEnv(name) {
    const v = process.env[name];
    if (v == null || v === "") {
        throw new Error(`Required environment variable ${name} is not set`);
    }
    return v;
}
function readInt(name) {
    return parseInt(readEnv(name), 10);
}
exports.config = {
    port: readInt("PORT"),
    graphqlPort: readInt("GRAPHQL_PORT"),
    jwtSecret: readEnv("JWT_SECRET"),
    internalToken: readEnv("INTERNAL_SERVICE_TOKEN"),
    userManagerUrl: readEnv("USER_MANAGER_URL"),
    rentManagerUrl: readEnv("RENT_MANAGER_URL"),
};
