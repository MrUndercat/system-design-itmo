"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.readCorsAllowedOrigins = readCorsAllowedOrigins;
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
    userGraphQlUrl: readEnv("USER_GRAPHQL_URL"),
    rentGraphQlUrl: readEnv("RENT_GRAPHQL_URL"),
    commGraphQlUrl: readEnv("COMM_GRAPHQL_URL"),
};
function readCorsAllowedOrigins() {
    return readEnv("CORS_ALLOWED_ORIGINS")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
