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
    {"question": "Industri", "answer": "Kontraktor"},
    {"question": "Produk yang diminati", "answer": "ZWCAD, SketchUp"},
    {"question": "Software yang digunakan saat ini", "answer": "AutoCAD"},
    {"question": "Kapan rencana pembelian", "answer": "3-6 bulan"},
    {"question": "Tindak lanjut", "answer": "Demo"},
    {"question": "Skor", "answer": "High"}
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

⚠️ ATURAN KHUSUS CHECKBOX (CENTANG):
Sales sering mencentang TIDAK TEPAT di dalam kotak — centang bisa meleset ke luar kotak, mengenai pilihan lain, atau coret asal-asalan.
- Jika ada coretan/centang yang mengenai atau berjarak ≤3mm dari sebuah checkbox, ANGGAP checkbox itu dicentang.
- Jika centang berada DI ANTARA dua checkbox (mengenai keduanya), pilih yang paling mungkin berdasarkan posisi mayoritas coretan.
- Jika centang meleset ke baris di atas/bawah tapi arah coretan jelas menuju satu kotak, ikuti arah coretan.
- JANGAN ragu hanya karena centang tidak rapi. Sales di exhibition mencentang cepat dan asal.

⚠️ ATURAN KHUSUS FORM MFG (JIKA FORM BER-LAYOUT 2 KOLOM):
Form MFG menyusun opsi dalam DUA KOLOM (kiri & kanan) dengan label panjang. Ini rawan salah baca baris/kolom.
- Baca SETIAP checkbox pada kotaknya sendiri. Cocokkan tanda centang HANYA dengan label yang tepat berada di sebelah kanan kotak itu — jangan geser ke label baris atas/bawah atau kolom seberang.
- "Industri" dua kolom: kolom kiri (Otomotif & Komponen, Logam & Fabrikasi, Plastik/Kimia & Kemasan) vs kolom kanan (Elektronik & Elektrikal, Alat Berat & Machinery, Lainnya). Pastikan kotak yang dicentang sejajar horizontal dengan label yang kamu pilih.
- Section "Software yang digunakan saat ini" ADA DAN TERPISAH dari "Produk yang diminati". Jangan lewati section Software — periksa tiap opsinya (AutoCAD, SolidWorks, Autodesk Inventor/Fusion 360, ANSYS/software simulasi lain, ZWCAD/ZW3D/SketchUp). Jawaban Produk TIDAK otomatis mengisi Software; keduanya dibaca terpisah.
- PRESISI > menebak: untuk form MFG, hanya tandai checkbox yang kotaknya BENAR-BENAR terisi/tercoret. Jika ragu, JANGAN tambahkan opsi ekstra. Lebih baik satu centang yang benar daripada dua centang di mana satu salah.

⚠️ ATURAN KHUSUS CATATAN TANGAN:
- Kolom "Catatan" / "Kendala" / "Notes" ditulis sales dalam hitungan detik — tulisannya bisa jelek, acak, atau tercampur.
- Transkripsikan APA ADANYA persis seperti yang tertulis. Jangan memperbaiki ejaan, jangan menebak kata yang tidak jelas.
- Jika tidak terbaca sama sekali, tulis "Tidak terbaca" sebagai answer.

SALES CODE / INITIALS: Di form mungkin ada inisial sales yang ditulis tangan seperti LN, LS, NU, RU, TK, TA, BR, RQ. Jika inisial ditemukan sebagai teks terpisah (bukan bagian dari kata panjang), simpan sebagai formAnswers dengan question: "Sales code".

PERTANYAAN YANG SERING MUNCUL DI FORM (cari dan ekstrak):
Ada dua varian form yang beredar (AEC dan MFG) — cocokkan dengan pilihan yang BENAR-BENAR TERCETAK di gambar, jangan paksa ke varian yang salah.
- "Industri" → varian AEC: Arsitek, Interior Design, Kontraktor, Developer, Lainnya. Varian MFG: Otomotif & Komponen, Elektronik & Elektrikal, Logam & Fabrikasi, Alat Berat & Machinery, Plastik/Kimia & Kemasan, Lainnya
- "Produk yang diminati" / "Produk" → varian AEC: ZWCAD, SketchUp, Archicad, Rendering, Lainnya. Varian MFG (terbagi Software / Hardware): Software = ZWCAD (2D/3D CAD), ZW3D (Desain 3D & CAM), SketchUp, ANSYS (Simulasi/CAE); Hardware = 3D Scanner (Scanology/Shining), Lainnya. UNTUK FORM MFG: tulis nama produk kanonik apa adanya (ZWCAD, ZW3D, SketchUp, ANSYS, 3D Scanner) — jangan disingkat atau diparafrase.
- "Software yang digunakan" / "Software saat ini" → varian AEC: AutoCAD, SketchUp, Revit, Archicad, ZWCAD, Lainnya. Varian MFG: AutoCAD, SolidWorks, Autodesk Inventor/Fusion 360, ANSYS/software simulasi lain, ZWCAD/ZW3D/SketchUp, Lainnya. UNTUK FORM MFG: tulis nama software kanonik apa adanya (AutoCAD, SolidWorks, Inventor, Fusion 360, ANSYS) — jangan disingkat atau diparafrase.
- "Rencana pembelian" / "Kapan" → cari centang pada: <3 bulan, 3-6 bulan, >6 bulan, Belum ada (sama di kedua varian)
- "Tindak lanjut" / "Follow up" → varian AEC: Demo, Penawaran, Kunjungan, Follow-up Call. Varian MFG: Demo, Trial/POC, Penawaran, Kunjungan, Follow-up Call. UNTUK FORM MFG: tulis pilihan kanonik apa adanya (Demo, Trial, POC, Penawaran, Kunjungan, Follow-up Call) — jangan disingkat atau diparafrase.
- "Skor" → cari centang pada: High, Medium, Low (sama di kedua varian)
- "Catatan" / "Kendala" / "Notes" → transkripsikan tulisan tangan apa adanya

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

⚠️ ATURAN CHECKBOX: Sales mencentang cepat dan sering meleset. Jika coretan mengenai atau berjarak ≤3mm dari checkbox, anggap dicentang. Jika di antara dua opsi, pilih yang paling mendekati.

⚠️ ATURAN CATATAN: Tulisan tangan sales bisa jelek dan acak. Transkripsikan apa adanya, jangan diperbaiki.

SALES INITIALS: Cari inisial sales (LN, LS, NU, RU, TK, TA, BR, RQ) yang ditulis tangan sebagai teks terpisah — simpan sebagai {"question": "Sales code", "answer": "<inisial>"}.

Ada dua varian form (AEC dan MFG) — cocokkan dengan pilihan yang tercetak di gambar, jangan paksa ke varian yang salah.
- "Industri" → AEC: Arsitek, Interior Design, Kontraktor, Developer, Lainnya. MFG: Otomotif & Komponen, Elektronik & Elektrikal, Logam & Fabrikasi, Alat Berat & Machinery, Plastik/Kimia & Kemasan, Lainnya
- "Produk yang diminati" → AEC: ZWCAD, SketchUp, Archicad, Rendering, Lainnya. MFG (Software/Hardware): ZWCAD (2D/3D CAD), ZW3D (Desain 3D & CAM), SketchUp, ANSYS (Simulasi/CAE), 3D Scanner (Scanology/Shining), Lainnya
- "Software yang digunakan saat ini" → AEC: AutoCAD, SketchUp, Revit, Archicad, ZWCAD, Lainnya. MFG: AutoCAD, SolidWorks, Autodesk Inventor/Fusion 360, ANSYS/software simulasi lain, ZWCAD/ZW3D/SketchUp, Lainnya
- "Rencana pembelian" → cari centang pada <3, 3-6, >6, Belum ada
- "Tindak lanjut" → AEC: Demo, Penawaran, Kunjungan, Follow-up Call. MFG: Demo, Trial/POC, Penawaran, Kunjungan, Follow-up Call
- "Skor" → cari centang pada High, Medium, Low
- "Catatan" / "Kendala" → transkripsikan tulisan tangan apa adanya

Jika TIDAK ADA pertanyaan form di slice ini, kembalikan formAnswers: [].

Kembalikan HANYA JSON: {"formAnswers": [{"question": "...", "answer": "..."}]}`;
}
