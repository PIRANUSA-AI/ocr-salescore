import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 storage client (S3-compatible).
 * Replaces Firebase Storage so the app can stay on the free Spark plan.
 * All uploads happen server-side here to keep credentials secret and to
 * avoid CORS/presign complexity.
 */

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET || 'salescore-ocr';
const publicUrl = process.env.R2_PUBLIC_URL || '';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.warn('WARNING: R2 env vars not set. File uploads will fail.');
}

export const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
});

/** Upload a binary buffer and return its public URL. */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
  return `${publicUrl}/${key}`;
}

/** Delete an object by key. */
export async function deleteFromR2(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** Build the public URL for a stored key. */
export function r2PublicUrl(key: string): string {
  return `${publicUrl}/${key}`;
}

export const R2_BUCKET = bucket;
