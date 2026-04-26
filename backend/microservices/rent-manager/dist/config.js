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
    s3Endpoint: readEnv("S3_ENDPOINT"),
    s3Region: readEnv("S3_REGION"),
    s3AccessKeyId: readEnv("S3_ACCESS_KEY_ID"),
    s3SecretAccessKey: readEnv("S3_SECRET_ACCESS_KEY"),
    s3Bucket: readEnv("S3_BUCKET"),
    s3PublicBaseUrl: readEnv("S3_PUBLIC_BASE_URL"),
};
