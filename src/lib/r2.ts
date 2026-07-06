import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommandInput } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

/**
 * Cloudflare R2 storage client (S3-compatible).
 * All uploads happen server-side. Images are served via presigned URLs
 * so the bucket does NOT need to be publicly accessible.
 */

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET || 'salescore-ocr';

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.warn('WARNING: R2 env vars not set. File uploads will fail.');
}

export const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
});

/** Upload a binary buffer and return the object key. */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 credentials not configured. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return key;
}

/**
 * Generate a presigned URL for viewing/downloading an R2 object.
 * Expires in 1 hour by default.
 */
export async function getPresignedUrl(
  key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/**
 * Generate a presigned PUT URL so the client can upload directly to R2
 * without sending file data through Vercel serverless functions.
 * The client does a PUT request with the image binary to this URL.
 * Expires in 15 minutes (enough for large uploads).
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<string> {
  const params: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  };
  const command = new PutObjectCommand(params);
  return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
}

/** Delete an object by key. */
export async function deleteFromR2(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export const R2_BUCKET = bucket;

const OCR_PREFIX = 'ocr';

/** Get file extension from a data URI mime type. */
function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return map[mime] || 'jpg';
}

/**
 * Upload an OCR image (base64 data URI) to R2 and return the object key.
 */
export async function uploadOcrImage(dataUri: string): Promise<string> {
  const match = dataUri.match(/^data:(.*?);base64,(.*)$/);
  if (!match) {
    throw new Error('Invalid data URI format');
  }
  const mime = match[1];
  const base64 = match[2];
  const ext = mimeToExt(mime);
  const key = `${OCR_PREFIX}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(base64, 'base64');
  return uploadToR2(buffer, key, mime);
}
