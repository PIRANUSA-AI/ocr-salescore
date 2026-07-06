'use server';

import { extractCustomer } from '@/lib/ocr/extract';
import { getObjectAsDataUri, getPresignedUrl } from '@/lib/r2';
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
 *
 * Flow:
 * 1. Client uploads directly to R2 via presigned PUT → gets `imageKey`
 * 2. Client calls this with the key
 * 3. Server fetches the image from R2, converts to base64,
 *    and passes it to the AI pipeline.
 */
export async function extractCustomerFromForm(input: {
  imageKey: string;
}): Promise<OcrFormResult> {
  if (!input?.imageKey) {
    throw new Error('Key gambar tidak boleh kosong. Upload gambar ke R2 terlebih dahulu.');
  }

  console.log('[Flow: extractCustomerFromForm] ARIES pipeline from key:', input.imageKey);

  try {
    const dataUri = await getObjectAsDataUri(input.imageKey);
    const result = await extractCustomer(dataUri, {
      alwaysSecondOpinion: true,
    });

    const viewUrl = await getPresignedUrl(input.imageKey);
    result.imageUrl = viewUrl;

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
