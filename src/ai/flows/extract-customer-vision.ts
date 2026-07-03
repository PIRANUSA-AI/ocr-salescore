'use server';

import { extractCustomer, type ExtractResult } from '@/lib/ocr/extract';
import { uploadOcrImage } from '@/lib/r2';

export type { ExtractResult } from '@/lib/ocr/extract';

export async function extractCustomerVision(input: {
  imageDataUri: string;
  alwaysSecondOpinion?: boolean;
}): Promise<ExtractResult> {
  if (!input?.imageDataUri) {
    throw new Error('Gambar tidak boleh kosong.');
  }

  // ── Step 1: Upload to R2 (wajib) ──
  // Upload dulu baru scan. Hasil scan akan pakai URL R2, bukan base64.
  // URL R2 juga dikembalikan supaya bisa disimpan ke DB sebagai referensi.
  const r2Url = await uploadOcrImage(input.imageDataUri);
  console.log('[OCR] R2 upload OK →', r2Url);

  // ── Step 2: Scan dari R2 URL ──
  console.log('[OCR] Scanning from R2 URL...');
  try {
    const result = await extractCustomer(r2Url, {
      alwaysSecondOpinion: input.alwaysSecondOpinion,
    });
    result.imageUrl = r2Url;
    console.log(
      `[OCR] done in ${result.elapsedMs}ms, imageUrl: ${r2Url}`,
    );
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal mengekstrak data dari gambar.';
    console.error('[Flow: extractCustomerVision] FAILED:', message);
    throw new Error(`Gagal mengekstrak data dari gambar. Penyebab: ${message}`);
  }
}
