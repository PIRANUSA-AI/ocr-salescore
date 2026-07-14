import { z } from 'zod';
import { callOpenAI } from '../openai-client.js';

export const OcrPreflightSchema = z.object({
  isRelevant: z.boolean(),
  visibleSummary: z.string(),
  reason: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type OcrPreflightResult = z.infer<typeof OcrPreflightSchema>;

export class OcrPreflightRejectError extends Error {
  constructor(public readonly preflight: OcrPreflightResult) {
    super(`Hmm kayanya ini bukan form kita deh, yang saya lihat hanya ${preflight.visibleSummary || 'gambar yang tidak relevan'}.`);
    this.name = 'OcrPreflightRejectError';
  }
}

export async function assertRelevantOcrImage(imageDataUri: string): Promise<OcrPreflightResult> {
  const model = process.env.OPENAI_PREFLIGHT_MODEL || process.env.OPENAI_OCR_MODEL || 'gpt-4.1';
  const result = await callOpenAI({
    model,
    temperature: 0,
    maxTokens: 512,
    imageDataUri,
    imageDetail: 'low', // cuma cek relevan/tidak — 1 tile ~85 token cukup
    schema: OcrPreflightSchema,
    systemPrompt: `Anda adalah gatekeeper OCR untuk aplikasi SalesCore PT PIRANUSA.

Tugas Anda hanya menentukan apakah gambar layak diproses sebagai OCR customer lead.

BOLEH LANJUT jika gambar berisi salah satu:
- form customer / form survey / form event / form lead
- kartu nama atau name card
- badge peserta yang berisi nama/perusahaan/email/telepon
- dokumen kontak prospek yang jelas berisi data customer

TOLAK jika gambar berisi:
- selfie, orang, makanan, ruangan, produk, pemandangan, screenshot aplikasi, chat, dokumen random
- gambar blank/blur total/gelap total
- gambar tanpa indikasi data customer seperti nama, perusahaan, telepon, email, jabatan, atau kebutuhan software

Jika ragu tapi terlihat ada field kontak/customer, izinkan. Jika ragu dan tidak terlihat data customer, tolak.
Output HANYA JSON valid.`,
    userPrompt: `Lihat gambar ini sebelum OCR berat.

Kembalikan JSON:
{
  "isRelevant": true/false,
  "visibleSummary": "deskripsi singkat hal yang terlihat, bahasa Indonesia, maksimal 12 kata",
  "reason": "alasan singkat",
  "confidence": "high" | "medium" | "low"
}`,
  });

  if (!result.isRelevant && result.confidence !== 'low') {
    throw new OcrPreflightRejectError(result);
  }

  return result;
}
