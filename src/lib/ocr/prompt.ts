import { OCR_FIELDS, OCR_FIELD_LABELS, type OcrResult, type Confidence } from './types';

/**
 * The single extraction prompt used by every provider so results are comparable.
 * Asks for each field plus a self-assessed confidence so the orchestrator can
 * decide which fields need a second opinion.
 */
export function buildExtractionPrompt(): string {
  const fieldList = OCR_FIELDS.map((f) => `${f} (${OCR_FIELD_LABELS[f]})`).join(', ');
  return `Anda adalah asisten OCR yang teliti. Analisis gambar FORM CUSTOMER / KARTU NAMA ini dan ekstrak data berikut: ${fieldList}.

Aturan:
1. Untuk setiap field, isi "value" dengan teks yang terbaca. Jika field tidak ada di gambar, isi value dengan string kosong "".
2. Untuk setiap field, isi "confidence" dengan salah satu: "high" (sangat jelas terbaca), "medium" (agak jelas tapi ada keraguan kecil), "low" (sulit terbaca / tidak yakin), "empty" (field tidak ada di gambar).
3. "division" = divisi / departemen.
4. "softwareNeeds" = software yang dipakai atau dibutuhkan (mis. ZWCAD, AutoCAD, SketchUp).
5. Jangan menebak. Kalau tidak yakin, turunkan confidence jadi medium atau low.

Kembalikan HANYA satu objek JSON valid (tanpa teks penjelasan, tanpa code fence):
{"name":{"value":"","confidence":"high"},"company":{"value":"","confidence":"high"},"jobTitle":{"value":"","confidence":"high"},"division":{"value":"","confidence":"high"},"phone":{"value":"","confidence":"high"},"email":{"value":"","confidence":"high"},"softwareNeeds":{"value":"","confidence":"high"}}`;
}

/** Pull the JSON object out of a model response, tolerating fences and prose. */
export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return t.slice(first, last + 1);
}

const VALID_CONFIDENCE: Confidence[] = ['high', 'medium', 'low', 'empty'];

/** Validate / coerce a raw parsed object into a well-formed OcrResult. */
export function coerceOcrResult(raw: any): OcrResult {
  const result = {} as OcrResult;
  for (const field of OCR_FIELDS) {
    const entry = raw?.[field];
    // Accept both {value, confidence} objects and bare strings.
    const value = typeof entry === 'string' ? entry : String(entry?.value ?? '');
    let confidence = typeof entry === 'object' && entry ? entry.confidence : 'high';
    if (!VALID_CONFIDENCE.includes(confidence)) confidence = value ? 'medium' : 'empty';
    result[field] = { value: value.trim(), confidence };
  }
  return result;
}
