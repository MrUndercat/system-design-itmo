"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureS3Bucket = ensureS3Bucket;
exports.normalizePhotoIds = normalizePhotoIds;
exports.buildPhotoUrl = buildPhotoUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("./config");
const s3 = new client_s3_1.S3Client({
    endpoint: config_1.config.s3Endpoint,
    region: config_1.config.s3Region,
    credentials: {
        accessKeyId: config_1.config.s3AccessKeyId,
        secretAccessKey: config_1.config.s3SecretAccessKey,
    },
    forcePathStyle: true,
});
async function ensureS3Bucket() {
    try {
        await s3.send(new client_s3_1.HeadBucketCommand({ Bucket: config_1.config.s3Bucket }));
    }
    catch {
        await s3.send(new client_s3_1.CreateBucketCommand({ Bucket: config_1.config.s3Bucket }));
    }
}
function normalizePhotoIds(photoIds) {
    if (!Array.isArray(photoIds))
        return [];
    const unique = new Set();
    for (const value of photoIds) {
        const id = value.trim();
        if (!id)
            continue;
        unique.add(id);
    }
    return Array.from(unique);
}
function buildPhotoUrl(photoId) {
    const base = config_1.config.s3PublicBaseUrl.replace(/\/+$/, "");
    return `${base}/${encodeURIComponent(photoId)}`;
}
