'use server';

import { extractCustomer, type ExtractResult } from '@/lib/ocr/extract';
import { uploadOcrImage, getPresignedUrl } from '@/lib/r2';
import { assertRelevantOcrImage, OcrPreflightRejectError } from '@/lib/ocr/preflight';

export type { ExtractResult } from '@/lib/ocr/extract';

export interface OcrRejectedResult {
  rejected: true;
  message: string;
  visibleSummary: string;
  reason: string;
}

export type ExtractCustomerVisionResult = ExtractResult | OcrRejectedResult;

/**
 * OCR flow: upload image to R2, then analyze.
 *
 * 1. Client compresses the image and sends base64 data URI
 * 2. Server uploads to R2 (S3 SDK, no CORS issues)
 * 3. Server generates presigned URL for AI + display
 * 4. AI primary (gpt-4.1) fetches from presigned URL
 * 5. AI verifier (gpt-5-nano) reviews text only — no image
 */
export async function extractCustomerVision(input: {
  imageDataUri: string;
  alwaysSecondOpinion?: boolean;
}): Promise<ExtractCustomerVisionResult> {
  if (!input?.imageDataUri) {
    throw new Error('Gambar tidak boleh kosong.');
  }

  try {
    const preflight = await assertRelevantOcrImage(input.imageDataUri);
    console.log(`[OCR] Preflight OK (${preflight.confidence}): ${preflight.visibleSummary}`);
  } catch (error) {
    if (error instanceof OcrPreflightRejectError) {
      console.warn(`[OCR] Preflight rejected: ${error.preflight.visibleSummary} - ${error.preflight.reason}`);
      return {
        rejected: true,
        message: error.message,
        visibleSummary: error.preflight.visibleSummary,
        reason: error.preflight.reason,
      };
    }
    const message = error instanceof Error ? error.message : 'Gagal memeriksa gambar.';
    console.error('[OCR] Preflight failed:', message);
    throw new Error(`Gagal memeriksa gambar sebelum OCR. Penyebab: ${message}`);
  }

  // Step 1: Upload to R2 (server-side, S3 SDK)
  const key = await uploadOcrImage(input.imageDataUri);
  console.log('[OCR] R2 upload OK → key:', key);

  // Step 2: Generate presigned URL for AI + display (lightweight)
  const imageUrl = await getPresignedUrl(key, 1800);

  // Step 3: Analyze — primary gets presigned URL, verifier gets text only
  try {
    const result = await extractCustomer(imageUrl, {
      alwaysSecondOpinion: input.alwaysSecondOpinion,
    });
    result.imageUrl = imageUrl;
    console.log(`[OCR] done in ${result.elapsedMs}ms`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengekstrak data dari gambar.';
    console.error('[Flow: extractCustomerVision] FAILED:', message);
    throw new Error(`Gagal mengekstrak data dari gambar. Penyebab: ${message}`);
  }
}
