import { OCR_FIELDS, OCR_FIELD_LABELS, type FormTeam } from '../types.js';

export type { FormTeam };

/**
 * Opsi checkbox yang benar-benar tercetak per varian form. Mirror dari
 * TEAM_FORM_OPTIONS di frontend (ocr-capture-view). Prompt HANYA diberi opsi
 * team yang relevan — model kecil (gpt-4o-mini) tidak perlu memilih antara dua
 * varian sekaligus, jadi lebih fokus dan tidak salah kolom.
 */
const FORM_OPTIONS: Record<FormTeam, {
  industri: string[];
  produk: string[];
  software: string[];
  tindakLanjut: string[];
}> = {
  AEC: {
    industri: ['Arsitek', 'Interior Design', 'Kontraktor', 'Developer', 'Lainnya'],
    produk: ['ZWCAD', 'SketchUp', 'Archicad', 'Rendering', 'Lainnya'],
    software: ['AutoCAD', 'SketchUp', 'Revit', 'Archicad', 'ZWCAD', 'Lainnya'],
    tindakLanjut: ['Demo', 'Penawaran', 'Kunjungan', 'Follow-up Call'],
  },
  MFG: {
    industri: ['Otomotif & Komponen', 'Elektronik & Elektrikal', 'Logam & Fabrikasi', 'Alat Berat & Machinery', 'Plastik, Kimia & Kemasan', 'Lainnya'],
    produk: ['ZWCAD', 'ZW3D', 'SketchUp', 'ANSYS', '3D Scanner', 'Lainnya'],
    software: ['AutoCAD', 'SolidWorks', 'Autodesk Inventor/Fusion 360', 'ANSYS', 'ZWCAD/ZW3D/SketchUp', 'Lainnya'],
    tindakLanjut: ['Demo', 'Trial/POC', 'Penawaran', 'Kunjungan', 'Follow-up Call'],
  },
};

export function buildFieldList(): string {
  return OCR_FIELDS
    .filter((f) => f !== 'formAnswers')
    .map((f) => `${f} (${OCR_FIELD_LABELS[f]})`)
    .join(', ');
}

/**
 * Daftar pertanyaan form untuk satu team saja. Satu baris per section, opsi
 * dari varian yang benar. Section yang sama di kedua varian (Rencana, Skor,
 * Catatan) ditulis sekali.
 */
function buildFormQuestions(team: FormTeam): string {
  const o = FORM_OPTIONS[team];
  return `- "Industri" → cari centang pada: ${o.industri.join(', ')}
- "Produk yang diminati" / "Produk" → cari centang pada: ${o.produk.join(', ')}
- "Software yang digunakan" / "Software saat ini" → cari centang pada: ${o.software.join(', ')}
- "Rencana pembelian" / "Kapan" → cari centang pada: <3 bulan, 3-6 bulan, >6 bulan, Belum ada
- "Tindak lanjut" / "Follow up" → cari centang pada: ${o.tindakLanjut.join(', ')}
- "Skor" → cari centang pada: High, Medium, Low
- "Catatan" / "Kendala" / "Notes" → transkripsikan tulisan tangan apa adanya`;
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
    {"question": "Industri", "answer": "Kontraktor"},
    {"question": "Produk yang diminati", "answer": "ZWCAD, SketchUp"},
    {"question": "Software yang digunakan saat ini", "answer": "AutoCAD"},
    {"question": "Kapan rencana pembelian", "answer": "3-6 bulan"},
    {"question": "Tindak lanjut", "answer": "Demo"},
    {"question": "Skor", "answer": "High"},
    {"question": "Catatan", "answer": "Minta demo minggu depan"}
  ]
}`;
}

export function buildUserPrompt(imageDataUri: string, extraContext?: string, team: FormTeam = 'AEC'): string {
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

⚠️ CHECKBOX: Sales mencentang cepat dan sering meleset. Jika coretan mengenai atau berjarak ≤3mm dari sebuah checkbox, anggap dicentang. Jika centang di antara dua kotak, pilih yang paling dekat. Cocokkan centang HANYA dengan label tepat di sebelahnya — jangan geser ke baris atas/bawah.

⚠️ CATATAN TANGAN (WAJIB dicari): Kolom "Catatan"/"Kendala"/"Notes" ditulis sales cepat dan bisa jelek. Transkripsikan APA ADANYA — jangan perbaiki ejaan, jangan tebak. Jika ada tulisan tangan sama sekali, WAJIB masukkan ke formAnswers sebagai {"question": "Catatan", "answer": "..."}. Jika tak terbaca, tulis answer "Tidak terbaca".

⚠️ IDENTITAS ≠ FORM: Field identitas (name, company, jobTitle, phone, email, address) HANYA dari area kartu nama / baris berlabel. JANGAN ambil label form ("Tim", "MFG", "Sales", "Event", "Industri") sebagai jobTitle. Jika baris "Jabatan" kosong, isi jobTitle "" confidence "empty" — jangan tebak.

SALES CODE: Inisial sales tulisan tangan (LN, LS, NU, RU, TK, TA, BR, RQ) jika berdiri sendiri → simpan sebagai formAnswers {"question": "Sales code", "answer": "<inisial>"}.

PERTANYAAN FORM (varian ${team}) — cari dan ekstrak:
${buildFormQuestions(team)}

Jika tidak menemukan form, formAnswers boleh dikosongkan.

Kembalikan HANYA satu objek JSON valid dengan format persis seperti contoh berikut (tanpa markdown fence, tanpa teks lain):

${buildExampleOutput()}

WAJIB: Gunakan nilai confidence yang jujur. Jangan menebak.`;

  return prompt;
}

export function buildSliceFormPrompt(team: FormTeam = 'AEC'): string {
  return `Anda melihat sepotong (slice) dari form customer PT PIRANUSA.
Tugas Anda: deteksi apakah ada pertanyaan form, checkbox, atau tulisan tangan di gambar ini.

Jika ADA pertanyaan form, ekstrak sebagai array formAnswers — setiap entri harus memiliki:
- "question": teks pertanyaan persis seperti yang tercetak
- "answer": jawaban (centang / tulisan tangan)

⚠️ CHECKBOX: Sales mencentang cepat dan sering meleset. Jika coretan mengenai atau berjarak ≤3mm dari checkbox, anggap dicentang. Jika di antara dua opsi, pilih yang paling dekat.

⚠️ CATATAN: Tulisan tangan sales bisa jelek dan acak. Transkripsikan apa adanya, jangan diperbaiki.

SALES INITIALS: Cari inisial sales (LN, LS, NU, RU, TK, TA, BR, RQ) yang ditulis tangan sebagai teks terpisah — simpan sebagai {"question": "Sales code", "answer": "<inisial>"}.

PERTANYAAN FORM (varian ${team}):
${buildFormQuestions(team)}

Jika TIDAK ADA pertanyaan form di slice ini, kembalikan formAnswers: [].

Kembalikan HANYA JSON: {"formAnswers": [{"question": "...", "answer": "..."}]}`;
}
