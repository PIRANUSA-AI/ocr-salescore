import { OCR_FIELDS, OCR_FIELD_LABELS } from '../types';

export function buildFieldList(): string {
  return OCR_FIELDS
    .filter((f) => f !== 'formAnswers')
    .map((f) => `${f} (${OCR_FIELD_LABELS[f]})`)
    .join(', ');
}

export function buildExampleOutput(): string {
  return `{
  "name": {"value": "Budi Santoso", "alternatives": [], "confidence": "high"},
  "company": {"value": "PT Maju Jaya", "alternatives": ["CV Maju Bersama"], "confidence": "high"},
  "jobTitle": {"value": "Project Manager", "alternatives": [], "confidence": "medium"},
  "division": {"value": "Engineering", "alternatives": [], "confidence": "high"},
  "phone": {"value": "0812-3456-7890", "alternatives": ["+62 21 1234567"], "confidence": "high"},
  "email": {"value": "budi@majujaya.com", "alternatives": ["budi.s@outlook.com"], "confidence": "high"},
  "softwareNeeds": {"value": "AutoCAD", "alternatives": ["ZWCAD"], "confidence": "medium"},
  "formAnswers": [
    {"question": "Prioritas Pelanggan", "answer": "High"},
    {"question": "Bergerak dalam industri apa?", "answer": "Konstruksi"}
  ]
}`;
}

export function buildUserPrompt(imageDataUri: string, extraContext?: string): string {
  let prompt = `Analisis gambar FORM CUSTOMER / KARTU NAMA ini dengan saksama.

Field yang harus diekstrak: ${buildFieldList()}.

`;
  if (extraContext) {
    prompt += `Konteks tambahan / evidence layout:
${extraContext}

ATURAN EVIDENCE:
- Gunakan evidence per kotak sebagai bantuan lokasi dan kandidat mentah, bukan sumber kebenaran tunggal.
- Tetap baca ulang gambar penuh sebelum memilih nilai final.
- Jika rawText/candidates ambigu atau terlihat salah, abaikan evidence yang buruk dan turunkan confidence.
- Jika sebuah field tidak punya evidence jelas, kosongkan field itu.

`;
  }

  prompt += `Kembalikan HANYA satu objek JSON valid dengan format persis seperti contoh berikut (tanpa markdown fence, tanpa teks lain):

${buildExampleOutput()}

WAJIB: Gunakan nilai confidence yang jujur. Jangan menebak.`;

  return prompt;
}
