'use server';

import { extractCustomer } from '@/lib/ocr/extract';
import { uploadOcrImage } from '@/lib/r2';
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

export async function extractCustomerFromForm(input: {
  imageDataUri: string;
}): Promise<OcrFormResult> {
  if (!input?.imageDataUri) {
    throw new Error('Gambar tidak boleh kosong.');
  }

  // ── Step 1: Upload to R2 (wajib) ──
  const r2Url = await uploadOcrImage(input.imageDataUri);
  console.log('[OCR] R2 upload OK →', r2Url);

  // ── Step 2: Scan dari R2 URL ──
  console.log('[Flow: extractCustomerFromForm] ARIES pipeline');

  try {
    const result = await extractCustomer(r2Url, {
      alwaysSecondOpinion: true,
    });

    result.imageUrl = r2Url;

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
