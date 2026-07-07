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
    {"question": "Prioritas Pelanggan", "answer": "High"},
    {"question": "Industri perusahaan?", "answer": "Kontraktor"},
    {"question": "Apa posisi saat ini?", "answer": "Owner"},
    {"question": "Produk apa yang paling Anda minati?", "answer": "ZWCAD, SketchUp"},
    {"question": "Saat ini software apa yang digunakan?", "answer": "AutoCAD"},
    {"question": "Tujuan penggunaan software?", "answer": "Gambar 2D, Desain 3D"},
    {"question": "Berapa jumlah pengguna software di perusahaan?", "answer": "5-10"},
    {"question": "Kapan rencana upgrade / pembelian software?", "answer": "3-6 bulan"},
    {"question": "Apakah bersedia untuk Demo Produk?", "answer": "Ya"},
    {"question": "Apa kendala saat ini dalam proses design", "answer": ""},
    {"question": "Note Tambahan", "answer": ""}
  ]
}`;
}

const FORM_QUESTIONS = [
  'Prioritas Pelanggan',
  'Industri perusahaan?',
  'Apa posisi saat ini?',
  'Produk apa yang paling Anda minati?',
  'Saat ini software apa yang digunakan?',
  'Tujuan penggunaan software?',
  'Berapa jumlah pengguna software di perusahaan?',
  'Kapan rencana upgrade / pembelian software?',
  'Apakah bersedia untuk Demo Produk?',
  'Apa kendala saat ini dalam proses design',
  'Note Tambahan',
];

function buildFormChecklist(): string {
  return FORM_QUESTIONS.map((q, i) => `${i + 1}. "${q}"`).join('\n');
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

  prompt += `Jika gambar mengandung FORM CUSTOMER PT PIRANUSA (form berdiri sendiri atau form dengan kartu nama tertempel), formAnswers WAJIB berisi SEMUA 11 pertanyaan berikut, PERSIS, TANPA TERKECUALI — sebelum menulis JSON, cek satu per satu apakah ke-11 pertanyaan ini sudah ada di array formAnswers kamu:

${buildFormChecklist()}

Pertanyaan yang checkbox-nya kosong / tidak tercentang TETAP masuk sebagai entri dengan answer = "" — JANGAN dihilangkan dari array. Untuk pertanyaan checkbox dengan lebih dari satu kotak tercentang (misal CAD dan CAM sekaligus), gabungkan SEMUA yang tercentang dipisah koma — JANGAN hanya ambil satu.

Kembalikan HANYA satu objek JSON valid dengan format persis seperti contoh berikut (tanpa markdown fence, tanpa teks lain):

${buildExampleOutput()}

WAJIB: Gunakan nilai confidence yang jujur. Jangan menebak.`;

  return prompt;
}
