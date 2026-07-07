export function buildGuardrailPrompt(): string {
  return `ATURAN VALIDASI PER FIELD - PATUHI DENGAN KETAT:

PHONE:
- WAJIB diawali +62, 62, 08, 021, 022, 031, 061, atau kode area lain.
- WAJIB minimal 8 digit dan maksimal 15 digit setelah dibersihkan.
- BOLEH berisi spasi, tanda kurung, strip, titik.
- TIDAK BOLEH berisi nama orang, email, atau teks biasa.
- Jika ada 2+ nomor: value = nomor utama, alternatives = nomor lain.

EMAIL:
- WAJIB mengandung @ dan domain lengkap dengan titik, misalnya .com, .co.id, .net, .org, .ac.id, .or.id, .id.
- TIDAK BOLEH email terpotong seperti "nama@", "nama@i", "nama@co", atau domain tanpa titik.
- TIDAK BOLEH hanya nama tanpa @.
- TIDAK BOLEH nomor HP.
- Jika email terlihat terpotong, value harus "", confidence "empty" atau "low"; jangan membuat domain palsu.

NAME:
- TIDAK BOLEH format nomor HP.
- TIDAK BOLEH mengandung @.
- TIDAK BOLEH hanya angka.
- TIDAK BOLEH menerima kata yang terlihat seperti artefak OCR jika tidak jelas sebagai nama manusia.
- Contoh artefak OCR: akhiran aneh seperti "days", "davs", "davl" pada nama satu kata.
- Nama satu kata boleh hanya jika memang jelas terbaca sebagai nama orang.

COMPANY:
- TIDAK BOLEH format nomor HP.
- TIDAK BOLEH format email.
- TIDAK BOLEH sama persis dengan NAME.
- Ciri: PT, CV, UD, nama grup/usaha/merek.

JOB TITLE:
- TIDAK BOLEH format nomor HP atau email.
- TIDAK BOLEH jabatan terpotong seperti "Project man".
- Jika sangat jelas maksudnya "Project Manager", tulis "Project Manager" dengan confidence medium/low.
- Jika tidak jelas, kosongkan.
- Ciri: Manager, Direktur, Engineer, Staff, Owner, GM, VP, Head, Lead, Specialist, Supervisor, Consultant.

DIVISION:
- TIDAK BOLEH sama dengan JOB TITLE.
- Ciri: Finance, IT, Marketing, HRD, Produksi, Engineering, Sales.

SOFTWARE NEEDS:
- Ciri: nama software CAD/engineering yang dikenal.
- Contoh: ZWCAD, AutoCAD, SketchUp, D5 Render, CATIA, SolidWorks, Archicad, Enscape, ZW3D, Revit.
- TIDAK BOLEH nama perusahaan kecuali software memang bernama sama.

ATURAN GLOBAL:
- SKEPTIS 1000%. Jangan terima output yang tidak masuk akal hanya karena mirip bentuk tulisan.
- JANGAN PERNAH mengisi value dengan "tidak ada", "-", "unknown", "none", "N/A", "null", atau "undefined".
- JANGAN PERNAH mengarang data yang tidak terbaca di gambar.
- Jika field terisi tapi jelas tidak masuk akal untuk field itu, kosongkan.
- Jika ragu sebuah teks milik field mana, lebih baik tidak diisi.
- Kosong lebih baik daripada salah paksa.
- Jika field tidak jelas: value "", confidence "empty", alternatives [].

FORM ANSWERS (formAnswers):
- JANGAN PERNAH mengisi answer dengan pilihan yang TIDAK tercentang/ditandai secara visual.
- JANGAN mengisi answer berdasarkan asumsi umum tentang industri/software pelanggan — hanya berdasarkan apa yang benar-benar ditandai/tertulis di gambar.
- Untuk checkbox kosong (tidak ada satupun tercentang): answer = "", JANGAN isi dengan "-", "tidak ada", "N/A", atau menebak salah satu opsi.
- Untuk kolom tulisan tangan kosong: answer = "", JANGAN mengarang isi.
- Jika tercentang lebih dari satu pilihan pada pertanyaan yang seharusnya pilihan tunggal, cantumkan semua yang tercentang dipisah koma — JANGAN memilih satu secara sepihak.
- question harus PERSIS sama dengan teks pertanyaan yang diberikan di LANGKAH 4, karakter demi karakter — JANGAN parafrase atau menyingkat.`;
}
