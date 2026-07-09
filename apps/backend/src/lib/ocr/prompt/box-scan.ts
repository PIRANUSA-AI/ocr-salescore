import { z } from 'zod';
import { OCR_FIELDS, VALID_CONFIDENCE, type Confidence } from '../types';

const BoxFieldSchema = z.enum(['name', 'company', 'jobTitle', 'division', 'phone', 'email', 'softwareNeeds', 'formAnswer', 'unknown']);

export const BoxScanSchema = z.object({
  pageType: z.enum(['form', 'business_card', 'unknown']),
  boxes: z.array(
    z.object({
      field: BoxFieldSchema,
      label: z.string().default(''),
      region: z.string().default(''),
      rawText: z.string().default(''),
      candidates: z.array(z.string()).default([]),
      confidence: z.enum(['high', 'medium', 'low', 'empty']),
      notes: z.string().default(''),
    }),
  ),
});

export type BoxScanResult = z.infer<typeof BoxScanSchema>;
type RawBoxScanResult = z.input<typeof BoxScanSchema>;

export function buildBoxScanSystemPrompt(): string {
  return `Anda adalah AI layout scanner untuk OCR form/kartu nama PT PIRANUSA.

Tugas tahap ini BUKAN menyimpulkan data final. Tugas Anda hanya memecah gambar menjadi kotak/area, membaca label, lalu menyalin teks mentah per area.

ATURAN KETAT:
1. Scan dari atas ke bawah, kiri ke kanan.
2. Untuk setiap kotak/area/label, buat satu item boxes.
3. Semua field bisnis wajib dicari: name, company, jobTitle, division, phone, email, softwareNeeds, dan formAnswer.
4. Jangan normalisasi name/company yang sulit. Tulis rawText apa adanya.
5. Jika tulisan ambigu, isi candidates dengan 2-4 kandidat visual yang mungkin.
6. Jika field adalah name/company/email/phone dan tulisan sulit, confidence maksimal medium.
7. Jika tidak terbaca, rawText "", confidence "empty", candidates [].
8. Jangan mengisi berdasarkan tebakan umum, nama populer, nama perusahaan populer, atau inferensi dari email kecuali terlihat di area itu.
9. region harus deskriptif singkat, misalnya "atas kiri kolom Nama", "tengah kanan bawah label Email".

Output HANYA JSON valid.`;
}

export function buildBoxScanUserPrompt(): string {
  return `Pecah gambar ini menjadi area/kotak OCR sebelum ekstraksi final.

Field target:
${OCR_FIELDS.filter((f) => f !== 'formAnswers').join(', ')}

Kembalikan JSON:
{
  "pageType": "form" | "business_card" | "unknown",
  "boxes": [
    {
      "field": "name" | "company" | "jobTitle" | "division" | "phone" | "email" | "softwareNeeds" | "formAnswer" | "unknown",
      "label": "label yang terlihat",
      "region": "posisi kotak/area",
      "rawText": "transkripsi mentah",
      "candidates": ["kandidat jika ambigu"],
      "confidence": "high" | "medium" | "low" | "empty",
      "notes": "alasan singkat jika ambigu"
    }
  ]
}`;
}

export function coerceBoxScanResult(raw: RawBoxScanResult): BoxScanResult {
  return {
    pageType: raw.pageType || 'unknown',
    boxes: (raw.boxes || []).map((box) => ({
      field: box.field || 'unknown',
      label: String(box.label || '').trim(),
      region: String(box.region || '').trim(),
      rawText: String(box.rawText || '').trim(),
      candidates: Array.isArray(box.candidates) ? box.candidates.map((c) => String(c).trim()).filter(Boolean) : [],
      confidence: VALID_CONFIDENCE.includes(box.confidence as Confidence) ? box.confidence : 'low',
      notes: String(box.notes || '').trim(),
    })),
  };
}

export function formatBoxScanContext(scan: BoxScanResult): string {
  const lines = scan.boxes.map((box, idx) => {
    const candidates = box.candidates.length ? ` candidates=[${box.candidates.join(' | ')}]` : '';
    const notes = box.notes ? ` notes="${box.notes}"` : '';
    return `${idx + 1}. field=${box.field}; label="${box.label}"; region="${box.region}"; rawText="${box.rawText}"; confidence=${box.confidence};${candidates}${notes}`;
  });

  return `BOX-SCAN OCR EVIDENCE
Page type: ${scan.pageType}

Evidence per kotak ini hanya alat bantu lokasi dan kandidat mentah. Evidence ini bisa salah, jadi final OCR tetap harus melihat gambar. Jangan memilih kandidat box-scan yang lebih jauh dari bentuk visual tulisan pada gambar.

${lines.join('\n')}`;
}
