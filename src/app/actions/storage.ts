'use server';

import { uploadToR2, deleteFromR2, getPresignedUrl } from '@/lib/r2';

function parseDataUri(dataUri: string): { buffer: Buffer; contentType: string } {
  const match = dataUri.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) {
    throw new Error('Format data URI tidak valid.');
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  };
}

function extFor(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf',
  };
  return map[contentType] || 'bin';
}

export async function uploadImageToR2(
  dataUri: string,
  folder: string,
): Promise<{ url: string; key: string }> {
  const { buffer, contentType } = parseDataUri(dataUri);
  const ext = extFor(contentType);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const key = `${folder}/${stamp}.${ext}`;
  await uploadToR2(buffer, key, contentType);
  const url = await getPresignedUrl(key);
  return { url, key };
}

export async function deleteR2Object(key: string): Promise<{ success: boolean }> {
  await deleteFromR2(key);
  return { success: true };
}

/**
 * Upload an OCR image (base64 data URI) to R2 and return a presigned URL.
 * Client calls this FIRST, gets the presigned URL, then sends the URL
 * (not base64) to the analysis server action.
 */
/**
 * Get a fresh presigned URL for an existing R2 object.
 * Images stored with `imageKey` can be viewed at any time by calling this.
 */
export async function getR2PresignedUrl(key: string): Promise<{ url: string }> {
  const url = await getPresignedUrl(key);
  return { url };
}

export async function uploadOcrImageAction(
  dataUri: string,
): Promise<{ url: string; key: string }> {
  const { buffer, contentType } = parseDataUri(dataUri);
  const ext = extFor(contentType);
  const key = `ocr/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await uploadToR2(buffer, key, contentType);
  const url = await getPresignedUrl(key);
  return { url, key };
}
