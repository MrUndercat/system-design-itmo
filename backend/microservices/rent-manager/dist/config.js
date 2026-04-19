"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.config = {
    port: Number(process.env.PORT || 3002),
    graphqlPort: Number(process.env.GRAPHQL_PORT || 4002),
    jwtSecret: process.env.JWT_SECRET || "dev",
    internalToken: process.env.INTERNAL_SERVICE_TOKEN || "dev-internal-token",
    userManagerUrl: process.env.USER_MANAGER_URL || "http://localhost:3001",
    s3Endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
    s3Region: process.env.S3_REGION || "us-east-1",
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID || "minioadmin",
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "minioadmin",
    s3Bucket: process.env.S3_BUCKET || "listing-photos",
    s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL || "http://localhost:9000/listing-photos",
};
