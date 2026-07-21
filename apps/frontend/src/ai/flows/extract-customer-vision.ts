'use server';

import { extractCustomer, type ExtractResult } from '@/lib/ocr/extract';
import { uploadOcrImage, getPresignedUrl } from '@/lib/r2';
import { assertRelevantOcrImage, OcrPreflightRejectError } from '@/lib/ocr/preflight';
import { sliceImage } from '@/lib/ocr/image-slicer';
import { callOpenAI } from '@/ai/openai-client';
import { buildSliceFormPrompt } from '@/lib/ocr/prompt/template';
import { z } from 'zod';

export type { ExtractResult } from '@/lib/ocr/extract';

export interface OcrRejectedResult {
  rejected: true;
  message: string;
  visibleSummary: string;
  reason: string;
}

export type ExtractCustomerVisionResult = ExtractResult | OcrRejectedResult;

const SliceFormSchema = z.object({
  formAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string(),
  })),
});

/**
 * OCR flow: upload image to R2, then analyze.
 *
 * 1. Client compresses the image and sends base64 data URI
 * 2. Server uploads to R2 (S3 SDK, no CORS issues)
 * 3. Server generates presigned URL for AI + display
 * 4. AI primary (gpt-4.1) fetches from presigned URL
 * 5. AI verifier (gpt-5-nano) reviews text only — no image
 * 6. If formAnswers empty, slice image and re-scan each slice for form fields
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
    result.imageKey = key;

    // Step 4: If formAnswers is empty, try slicing image and scanning each slice
    const hasFormAnswers = result.formAnswers && result.formAnswers.length > 0;
    if (!hasFormAnswers) {
      console.log('[OCR] No form answers detected, trying image slicing...');
      try {
        const slices = await sliceImage(input.imageDataUri, 5, 0.1);
        console.log(`[OCR] Sliced into ${slices.length} pieces`);

        const allAnswers: { question: string; answer: string }[] = [];
        const seenQuestions = new Set<string>();

        for (const slice of slices) {
          try {
            const sliceResult = await callOpenAI({
              systemPrompt: buildSliceFormPrompt(),
              userPrompt: 'Ekstrak form answers dari slice gambar ini.',
              schema: SliceFormSchema,
              model: process.env.OPENAI_OCR_MODEL || 'gpt-4.1',
              temperature: 0,
              maxTokens: 1024,
              imageDataUri: slice.dataUri,
            });

            for (const fa of sliceResult.formAnswers ?? []) {
              const key = fa.question.toLowerCase().trim();
              if (fa.answer && !seenQuestions.has(key)) {
                seenQuestions.add(key);
                allAnswers.push(fa);
              }
            }
          } catch (sliceErr) {
            console.warn(`[OCR] Slice ${slice.index} failed:`, sliceErr instanceof Error ? sliceErr.message : sliceErr);
          }
        }

        if (allAnswers.length > 0) {
          console.log(`[OCR] Slice scanning found ${allAnswers.length} form answers`);
          result.formAnswers = allAnswers;
        }
      } catch (sliceErr) {
        console.warn('[OCR] Image slicing failed, continuing without:', sliceErr instanceof Error ? sliceErr.message : sliceErr);
      }
    }

    console.log(`[OCR] done in ${result.elapsedMs}ms`);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengekstrak data dari gambar.';
    console.error('[Flow: extractCustomerVision] FAILED:', message);
    throw new Error(`Gagal mengekstrak data dari gambar. Penyebab: ${message}`);
  }
}
