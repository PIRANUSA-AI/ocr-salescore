'use server';

import { extractCustomer } from '@/lib/ocr/extract';
import type { ExtractResult } from '@/lib/ocr/extract';
import type { FormAnswer } from '@/lib/ocr/types';

export interface OcrFormResult {
  name?: string;
  company?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  formAnswers?: FormAnswer[];
  /** Full structured result from ARIES pipeline */
  _fullResult?: ExtractResult;
}

/**
 * Analyze a form image that has already been uploaded to R2.
 * The client must call uploadOcrImageAction FIRST to get the R2 URL,
 * then pass that URL here — no base64 should be sent to this function.
 */
export async function extractCustomerFromForm(input: {
  imageUrl: string;
}): Promise<OcrFormResult> {
  if (!input?.imageUrl) {
    throw new Error('URL gambar tidak boleh kosong. Upload gambar ke R2 terlebih dahulu.');
  }

  console.log('[Flow: extractCustomerFromForm] ARIES pipeline from R2 URL:', input.imageUrl);

  try {
    const result = await extractCustomer(input.imageUrl, {
      alwaysSecondOpinion: true,
    });

    result.imageUrl = input.imageUrl;

    return {
      name: result.name.value || undefined,
      company: result.company.value || undefined,
      jobTitle: result.jobTitle.value || undefined,
      phone: result.phone.value || undefined,
      email: result.email.value || undefined,
      formAnswers: result.formAnswers || [],
      _fullResult: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengekstrak data dari gambar.';
    console.error('[Flow: extractCustomerFromForm] FAILED:', message);
    throw new Error(`Gagal mengekstrak data dari gambar. Penyebab: ${message}`);
  }
}
