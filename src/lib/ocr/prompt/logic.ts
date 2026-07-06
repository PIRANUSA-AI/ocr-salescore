export function buildLogicPrompt(): string {
  return `PROSES BERPIKIR (WAJIB DIIKUTI SEBAGAI INTERNAL REASONING):

LANGKAH 1 — SCAN:
Identifikasi SEMUA teks yang ada di gambar. Perhatikan posisi setiap teks (apakah di dalam kotak/label tertentu, atau di area bebas).

LANGKAH 2 — KLASIFIKASI:
Untuk setiap teks yang ditemukan, tentukan field yang paling cocok berdasarkan FORMAT dan KONTEKS:

📞 PHONE:
- Pola: diawali +62, 62, 08, 021, 022, 031, dsb
- Hanya berisi angka, spasi, tanda kurung, strip
- Contoh: 0812-3456-7890, +62 897 8130 772, 0211234567

📧 EMAIL:
- CARI SETIAP "@" DI GAMBAR. Di mana pun ada simbol @, itu adalah EMAIL. Tidak ada pengecualian.
- Setiap teks yang mengandung @ WAJIB masuk ke field EMAIL atau alternatives email.
- Pola: @ diikuti domain (.com, .co.id, .net, .ac.id, .or.id, .io, .id, .org)
- Contoh: budi@gmail.com, fitriani@piranusa.com, octavianda.Damarati@senzo.id
- Email bisa ada di pojok, di samping, di bawah nomor HP, atau di baris terakhir. Jangan sampai terlewat.
- Jika ada @ → itu email. Titik. Jangan ragu.

👤 NAME:
- Nama orang (depan dan/atau belakang)
- TIDAK mengandung angka dominan
- TIDAK mengandung @
- Contoh: Budi Santoso, Fitriani, I Made Wiryawan

🏢 COMPANY:
- Nama perusahaan/badan usaha
- Sering diakhiri PT, CV, UD, atau konteks perusahaan
- Contoh: PT Piranti Nusantara Teknologi, CV Karya Mandiri

💼 JOB TITLE:
- Posisi/jabatan dalam perusahaan
- Contoh: Manager, Direktur, Engineer, Account Manager, Staff, Owner

🏛️ DIVISION:
- Departemen atau divisi
- Contoh: Finance, IT, Marketing, Engineering, Produksi

💻 SOFTWARE NEEDS:
- Nama software CAD/engineering
- Contoh: ZWCAD, AutoCAD, SketchUp, D5 Render, CATIA, SolidWorks, Archicad, Enscape, ZW3D, Revit, 3ds Max, V-Ray, SAP2000, ETABS

LANGKAH 3 — CROSS-VALIDASI:
1. Jika teks di posisi "Nama" tapi isinya nomor HP → pindahkan ke PHONE
2. Jika teks di posisi "Perusahaan" tapi isinya nama orang → pindahkan ke NAME
3. Jika teks di posisi "No. Telp" tapi isinya email → pindahkan ke EMAIL
4. Jika teks tidak cocok dengan field manapun → simpan sebagai alternatif di field yang paling mendekati
5. Jika ada KONFLIK (satu teks cocok untuk 2 field), pilih yang PALING SESUAI berdasarkan format

LANGKAH 4 — FORM DETECTION:
Jika gambar adalah formulir dengan pertanyaan-pertanyaan terstruktur (seperti checkboxes, pilihan ganda, atau pertanyaan dengan jawaban tulisan tangan):
- Ekstrak setiap Q&A ke dalam array formAnswers
- Untuk checkbox/centang: tulis teks pilihan yang ditandai sebagai answer
- Untuk tulisan tangan di kolom kosong: transkripsikan apa adanya
- Untuk "Prioritas Pelanggan" (High/Medium/Low): jika tidak ada yang ditandai, isi "none"
- JANGAN ekstrak nama sales atau data non-pelanggan

LANGKAH 5 — MULTI-VALUE HANDLING:
Jika ada LEBIH DARI SATU nilai untuk field yang sama (misal: 2 nomor HP, 2 email):
- value = nilai yang paling utama / paling jelas
- alternatives = [nilai kedua, nilai ketiga, ...]
- JANGAN buang nilai manapun

LANGKAH 6 — CONFIDENCE:
- high: teks sangat jelas terbaca dan lolos validasi format
- medium: terbaca tapi ada keraguan kecil, atau format tidak sempurna
- low: sulit terbaca, atau tidak lolos guardrails
- empty: field tidak ada di gambar sama sekali`;
}
