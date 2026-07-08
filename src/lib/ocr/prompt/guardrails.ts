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
- Nama satu kata boleh hanya jika memang jelas terbaca sebagai nama orang.

COMPANY:
- TIDAK BOLEH format nomor HP.
- TIDAK BOLEH format email.
- TIDAK BOLEH sama persis dengan NAME.
- Ciri: PT, CV, UD, nama grup/usaha/merek.

JOB TITLE:
- TIDAK BOLEH format nomor HP atau email.
- Ciri: Manager, Direktur, Engineer, Staff, Owner, GM, VP, Head, Lead, Specialist, Supervisor, Consultant.

DIVISION:
- TIDAK BOLEH sama dengan JOB TITLE.
- Ciri: Finance, IT, Marketing, HRD, Produksi, Engineering, Sales.

SOFTWARE NEEDS:
- Ciri: nama software CAD/engineering yang dikenal.
- Contoh: ZWCAD, AutoCAD, SketchUp, D5 Render, CATIA, SolidWorks, Archicad, Enscape, ZW3D, Revit.

ATURAN GLOBAL:
- SKEPTIS 1000%. Jangan terima output yang tidak masuk akal hanya karena mirip bentuk tulisan.
- JANGAN PERNAH mengisi value dengan "tidak ada", "-", "unknown", "none", "N/A", "null", atau "undefined".
- JANGAN PERNAH mengarang data yang tidak terbaca di gambar.
- Jika field terisi tapi jelas tidak masuk akal untuk field itu, kosongkan.
- Kosong lebih baik daripada salah paksa.

CHECKBOX (CENTANG) — ATURAN LAPANGAN:
- Sales di exhibition mencentang CEPAT dan SERING MELESET. Centang bisa: keluar kotak, mengenai dua opsi, atau hanya coret asal.
- Jika ada coretan yang BERADA DI ATAS atau MENYENTUH kotak checkbox → ANGGAP dicentang. Tidak perlu centang sempurna di dalam kotak.
- Jika coretan berada DI ANTARA dua checkbox → lihat posisi mayoritas coretan. Jika 60%+ coretan mengarah ke satu opsi, pilih opsi itu.
- Jika coretan mengenai baris A tapi letak fisiknya lebih dekat ke baris B → pilih baris B (yang lebih dekat).
- Coretan tanpa arah jelas (lingkaran besar, coret acak) yang mencakup area beberapa checkbox → centangkan SEMUA yang terkena coretan.
- JANGAN mengabaikan centang hanya karena tidak rapi atau tidak di dalam kotak.

FORM ANSWERS (formAnswers) — ATURAN UMUM:
- question harus PERSIS dengan teks pertanyaan yang terbaca di gambar.
- JANGAN PERNAH mengisi answer dengan pilihan yang TIDAK ada coretan/centang.
- Untuk checkbox kosong: answer = "".
- Jika tercentang lebih dari satu pilihan, cantumkan SEMUA dipisah koma.

FORM ANSWERS — ATURAN CATATAN TANGAN:
- Kolom catatan/kendala ditulis sales dalam hitungan detik — tulisannya bisa jelek, tercampur, atau tidak rapi.
- Transkripsikan PERSIS apa adanya. Jangan perbaiki ejaan, jangan rapikan.
- Kata yang tidak jelas: tulis "Tidak terbaca". Jangan menebak.`;
}
