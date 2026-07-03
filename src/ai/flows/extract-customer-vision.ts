'use server';

import { extractCustomer, type ExtractResult } from '@/lib/ocr/extract';

/**
 * New OCR flow (FASE 1).
 *
 * Pipeline: gpt-4.1 (primary) -> second-opinion via gemma3 for fields the
 * primary is unsure about. Returns the 7 business-card / form fields, each
 * with a value and a confidence level, plus which fields the second opinion
 * overrode.
 *
 * This is the server-callable entry point used by the OCR UI.
 */
export type { ExtractResult } from '@/lib/ocr/extract';

export async function extractCustomerVision(input: {
  imageDataUri: string;
  alwaysSecondOpinion?: boolean;
}): Promise<ExtractResult> {
  if (!input?.imageDataUri) {
    throw new Error('Gambar tidak boleh kosong.');
  }
  console.log('[Flow: extractCustomerVision] primary gpt-4.1, fallback gemma3');
  try {
    const result = await extractCustomer(input.imageDataUri, {
      alwaysSecondOpinion: input.alwaysSecondOpinion,
    });
    console.log(
      `[Flow: extractCustomerVision] done in ${result.elapsedMs}ms, overridden: [${result.overriddenFields.join(', ')}]`,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengekstrak data dari gambar.';
    console.error('[Flow: extractCustomerVision] FAILED:', message);
    throw new Error(`Gagal mengekstrak data dari gambar. Penyebab: ${message}`);
  }
}
