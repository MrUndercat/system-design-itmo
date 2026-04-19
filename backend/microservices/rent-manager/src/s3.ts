import { randomUUID } from "crypto";
import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { config } from "./config";

const s3 = new S3Client({
  endpoint: config.s3Endpoint,
  region: config.s3Region,
  credentials: {
    accessKeyId: config.s3AccessKeyId,
    secretAccessKey: config.s3SecretAccessKey,
  },
  forcePathStyle: true,
});

export async function ensureS3Bucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: config.s3Bucket }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: config.s3Bucket }));
  }
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: config.s3Bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "PublicReadGetObject",
            Effect: "Allow",
            Principal: "*",
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${config.s3Bucket}/*`],
          },
        ],
      }),
    })
  );
}

export function normalizePhotoIds(photoIds: string[] | undefined): string[] {
  if (!Array.isArray(photoIds)) return [];
  const unique = new Set<string>();
  for (const value of photoIds) {
    const id = value.trim();
    if (!id) continue;
    unique.add(id);
  }
  return Array.from(unique);
}

export function buildPhotoUrl(photoId: string): string {
  const base = config.s3PublicBaseUrl.replace(/\/+$/, "");
  return `${base}/${encodeURIComponent(photoId)}`;
}

export async function uploadListingPhoto(params: {
  data: Buffer;
  contentType?: string;
}): Promise<string> {
  const photoId = randomUUID();
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: photoId,
      Body: params.data,
      ContentType: params.contentType || "application/octet-stream",
    })
  );
  return photoId;
}
