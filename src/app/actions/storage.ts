'use server';

import { uploadToR2, deleteFromR2 } from '@/lib/r2';

/**
 * Storage server actions (Cloudflare R2).
 * Clients send a base64 data URI; the server decodes & uploads to R2,
 * returning the public URL. Keeps R2 credentials server-side only.
 */

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
  const url = await uploadToR2(buffer, key, contentType);
  return { url, key };
}

export async function deleteR2Object(key: string): Promise<{ success: boolean }> {
  await deleteFromR2(key);
  return { success: true };
}
