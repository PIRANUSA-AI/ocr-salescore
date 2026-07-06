'use server';

import { extractCustomer, type ExtractResult } from '@/lib/ocr/extract';
import { getObjectAsDataUri, getPresignedUrl } from '@/lib/r2';

export type { ExtractResult } from '@/lib/ocr/extract';

/**
 * Analyze an image that has already been uploaded to R2.
 *
 * Flow:
 * 1. Client uploads directly to R2 via presigned PUT → gets `imageKey`
 * 2. Client calls this with the key
 * 3. Server fetches the image from R2, converts to base64,
 *    and passes it to the AI pipeline (no presigned URL dependency).
 */
export async function extractCustomerVision(input: {
  imageKey: string;
  alwaysSecondOpinion?: boolean;
}): Promise<ExtractResult> {
  if (!input?.imageKey) {
    throw new Error('Key gambar tidak boleh kosong. Upload gambar ke R2 terlebih dahulu.');
  }

  console.log('[OCR] Fetching from R2 key:', input.imageKey);

  try {
    // Fetch image from R2 server-side → base64 data URI
    const dataUri = await getObjectAsDataUri(input.imageKey);

    const result = await extractCustomer(dataUri, {
      alwaysSecondOpinion: input.alwaysSecondOpinion,
    });

    // Generate a fresh presigned URL so the client can display the image
    const viewUrl = await getPresignedUrl(input.imageKey);
    result.imageUrl = viewUrl;

    console.log(
      `[OCR] done in ${result.elapsedMs}ms, key: ${input.imageKey}`,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengekstrak data dari gambar.';
    console.error('[Flow: extractCustomerVision] FAILED:', message);
    throw new Error(`Gagal mengekstrak data dari gambar. Penyebab: ${message}`);
  }
}
