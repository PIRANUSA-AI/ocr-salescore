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
  "address": {"value": "Jl. Merdeka No. 12, Jakarta", "alternatives": [], "confidence": "high"},
  "formAnswers": [
    {"question": "Produk yang diminati", "answer": "ZWCAD, SketchUp"},
    {"question": "Software yang digunakan saat ini", "answer": "AutoCAD"},
    {"question": "Kapan rencana pembelian", "answer": "3-6 bulan"},
    {"question": "Tindak lanjut", "answer": "Demo"},
    {"question": "Prioritas", "answer": "High"}
  ]
}`;
}

export function buildUserPrompt(imageDataUri: string, extraContext?: string): string {
  let prompt = `Analisis gambar KARTU NAMA / FORM CUSTOMER ini dengan saksama.

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

  prompt += `PRIORITAS UTAMA:
1. Ekstrak data dari KARTU NAMA (name, company, jobTitle, phone, email, address).
2. Cari FORM / CHECKLIST di sekitar gambar. Jika ada kotak centang (checkbox) atau pertanyaan dengan tulisan tangan, ekstrak sebagai formAnswers.

PERTANYAAN YANG SERING MUNCUL DI FORM (cari dan ekstrak):
- "Produk yang diminati" / "Produk" → cari centang pada: ZWCAD, SketchUp, Archicad, Rendering, atau Lainnya
- "Software yang digunakan" / "Software saat ini" → cari centang pada: AutoCAD, SketchUp, Revit, Archicad, ZWCAD, atau Lainnya
- "Rencana pembelian" / "Kapan" → cari centang pada: <3 bulan, 3-6 bulan, >6 bulan, Belum ada
- "Tindak lanjut" / "Follow up" → cari centang pada: Demo, Penawaran, Kunjungan, Follow-up Call
- "Prioritas" / "Priority" → cari centang pada: High, Medium, Low

Jika tidak menemukan form, formAnswers boleh dikosongkan.

Kembalikan HANYA satu objek JSON valid dengan format persis seperti contoh berikut (tanpa markdown fence, tanpa teks lain):

${buildExampleOutput()}

WAJIB: Gunakan nilai confidence yang jujur. Jangan menebak.`;

  return prompt;
}

export function buildSliceFormPrompt(): string {
  return `Anda melihat sepotong (slice) dari form customer PT PIRANUSA.
Tugas Anda: deteksi apakah ada pertanyaan form, checkbox, atau tulisan tangan di gambar ini.

Jika ADA pertanyaan form, ekstrak sebagai array formAnswers — setiap entri harus memiliki:
- "question": teks pertanyaan persis seperti yang tercetak
- "answer": jawaban (centang / tulisan tangan)

Pertanyaan yang sering muncul:
- "Produk yang diminati" → cari centang pada ZWCAD, SketchUp, Archicad, Rendering, Lainnya
- "Software yang digunakan saat ini" → cari centang pada AutoCAD, SketchUp, Revit, Archicad, ZWCAD, Lainnya
- "Rencana pembelian" → cari centang pada <3, 3-6, >6, Belum ada
- "Tindak lanjut" → cari centang pada Demo, Penawaran, Kunjungan, Follow-up Call
- "Prioritas" → cari centang pada High, Medium, Low

Jika TIDAK ADA pertanyaan form di slice ini, kembalikan formAnswers: [].

Kembalikan HANYA JSON: {"formAnswers": [{"question": "...", "answer": "..."}]}`;
}
