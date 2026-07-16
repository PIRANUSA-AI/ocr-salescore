import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

export { s3 };

export const R2_BUCKET = config.r2.bucket;

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn },
  );
}

export async function getPresignedUploadUrl(
  key: string,
  expiresIn = 900,
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key }),
    { expiresIn },
  );
}

export async function deleteFromR2(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }),
  );
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function mimeToExt(mime: string): string {
  return MIME_EXT[mime] || 'bin';
}

export async function downloadFromR2(key: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
  );
  const body = await response.Body!.transformToByteArray();
  const buffer = Buffer.from(body);
  return { buffer, contentType: response.ContentType || 'image/jpeg' };
}

export async function uploadOcrImage(
  dataUri: string,
): Promise<{ key: string; url: string }> {
  const matches = dataUri.match(/^data:(image\/\w+);base64,(.+)/);
  if (!matches) throw new Error('Invalid data URI');

  const mime = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = mimeToExt(mime);
  const key = `ocr/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await uploadToR2(key, buffer, mime);
  const url = await getPresignedUrl(key, 1800);
  return { key, url };
}
