'use server';

import { uploadToR2, deleteFromR2, getPresignedUrl, getPresignedUploadUrl } from '@/lib/r2';

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

/**
 * Generate a presigned upload URL so the client can upload images
 * directly to Cloudflare R2 without sending file data through Vercel.
 *
 * Flow:
 * 1. Client calls this → gets uploadUrl + key
 * 2. Client PUTs the image binary directly to uploadUrl
 * 3. Client calls analysis with the key (not base64!)
 */
export async function getUploadUrl(contentType: string): Promise<{
  uploadUrl: string;
  key: string;
}> {
  const ext = extFor(contentType);
  const key = `ocr/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  return { uploadUrl, key };
}

/**
 * Get a fresh presigned view URL for an existing R2 object.
 * Call this whenever you need to display an image stored by key.
 */
export async function getR2PresignedUrl(key: string): Promise<{ url: string }> {
  const url = await getPresignedUrl(key);
  return { url };
}

export async function uploadImageToR2(
  dataUri: string,
  folder: string,
): Promise<{ url: string; key: string }> {
  const match = dataUri.match(/^data:([^;]+);base64,(.*)$/);
  if (!match) throw new Error('Format data URI tidak valid.');
  const contentType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
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
