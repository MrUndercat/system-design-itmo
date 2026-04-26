"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureS3Bucket = ensureS3Bucket;
exports.normalizePhotoIds = normalizePhotoIds;
exports.buildPhotoUrl = buildPhotoUrl;
exports.uploadListingPhoto = uploadListingPhoto;
const crypto_1 = require("crypto");
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
    await s3.send(new client_s3_1.PutBucketPolicyCommand({
        Bucket: config_1.config.s3Bucket,
        Policy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "PublicReadGetObject",
                    Effect: "Allow",
                    Principal: "*",
                    Action: ["s3:GetObject"],
                    Resource: [`arn:aws:s3:::${config_1.config.s3Bucket}/*`],
                },
            ],
        }),
    }));
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
async function uploadListingPhoto(params) {
    const photoId = (0, crypto_1.randomUUID)();
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: config_1.config.s3Bucket,
        Key: photoId,
        Body: params.data,
        ContentType: params.contentType || "application/octet-stream",
    }));
    return photoId;
}
