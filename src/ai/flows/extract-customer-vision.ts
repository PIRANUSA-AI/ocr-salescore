'use server';

import { extractCustomer, type ExtractResult } from '@/lib/ocr/extract';

export type { ExtractResult } from '@/lib/ocr/extract';

/**
 * Analyze an image that has already been uploaded to R2.
 * The client must call uploadOcrImageAction FIRST to get the R2 URL,
 * then pass that URL here — no base64 should be sent to this function.
 */
export async function extractCustomerVision(input: {
  imageUrl: string;
  alwaysSecondOpinion?: boolean;
}): Promise<ExtractResult> {
  if (!input?.imageUrl) {
    throw new Error('URL gambar tidak boleh kosong. Upload gambar ke R2 terlebih dahulu.');
  }

  console.log('[OCR] Scanning from R2 URL:', input.imageUrl);

  try {
    const result = await extractCustomer(input.imageUrl, {
      alwaysSecondOpinion: input.alwaysSecondOpinion,
    });
    result.imageUrl = input.imageUrl;
    console.log(
      `[OCR] done in ${result.elapsedMs}ms, imageUrl: ${input.imageUrl}`,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengekstrak data dari gambar.';
    console.error('[Flow: extractCustomerVision] FAILED:', message);
    throw new Error(`Gagal mengekstrak data dari gambar. Penyebab: ${message}`);
  }
}
