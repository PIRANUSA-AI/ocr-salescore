export function buildLogicPrompt(): string {
  return `PROSES BERPIKIR (WAJIB DIIKUTI SEBAGAI INTERNAL REASONING):

LANGKAH 1 — SCAN:
Identifikasi SEMUA teks yang ada di gambar. Perhatikan posisi setiap teks (apakah di dalam kotak/label tertentu, atau di area bebas).

LANGKAH 2 — KLASIFIKASI:
Untuk setiap teks yang ditemukan, tentukan field yang paling cocok berdasarkan FORMAT dan KONTEKS:

📞 PHONE:
- Pola: diawali +62, 62, 08, 021, 022, 031, dsb
- Hanya berisi angka, spasi, tanda kurung, strip

📧 EMAIL:
- CARI SETIAP "@" DI GAMBAR. Di mana pun ada simbol @, itu adalah EMAIL.
- Setiap teks yang mengandung @ WAJIB masuk ke field EMAIL atau alternatives email.

👤 NAME:
- Nama orang (depan dan/atau belakang)
- TIDAK mengandung angka dominan
- TIDAK mengandung @

🏢 COMPANY:
- Nama perusahaan/badan usaha
- Sering diakhiri PT, CV, UD

💼 JOB TITLE:
- Posisi/jabatan dalam perusahaan
- Contoh: Manager, Direktur, Engineer, Owner

🏛️ DIVISION:
- Departemen atau divisi
- Contoh: Finance, IT, Marketing, Engineering

💻 SOFTWARE NEEDS:
- Nama software CAD/engineering
- Contoh: ZWCAD, AutoCAD, SketchUp, D5 Render, Archicad

LANGKAH 3 — CROSS-VALIDASI:
1. Jika teks di posisi "Nama" tapi isinya nomor HP → pindahkan ke PHONE
2. Jika teks di posisi "Perusahaan" tapi isinya nama orang → pindahkan ke NAME
3. Jika teks di posisi "No. Telp" tapi isinya email → pindahkan ke EMAIL
4. Jika teks tidak cocok dengan field manapun → simpan sebagai alternatif di field yang paling mendekati
5. Jika ada KONFLIK (satu teks cocok untuk 2 field), pilih yang PALING SESUAI berdasarkan format

LANGKAH 4 — FORM DETECTION:
Jika gambar berisi area form dengan pertanyaan (ceklist / isian), ekstrak setiap Q&A sebagai array formAnswers.

DETEKSI CHECKBOX (CENTANG):
- Sales di exhibition mencentang SANGAT CEPAT. Centang sering: keluar kotak, mengenai dua opsi, atau coret panjang.
- CARI: coretan pensil/pulpen di DEKAT atau DI ATAS kotak checkbox. Tidak harus rapi di dalam.
- Jika coretan mengenai kotak A dan B (di antara dua) → pilih berdasarkan PROXIMITY (posisi mayoritas coretan lebih dekat ke mana).
- Jika coretan panjang mengenai 3+ opsi sekaligus → centangkan SEMUA yang terkena.
- Coretan berbentuk lingkaran besar yang mencakup area checkbox → centangkan opsi yang ada di dalam lingkaran.
- JANGAN lewatkan centang hanya karena bentuknya tidak sempurna.

DETEKSI CATATAN TANGAN:
- Cari tulisan tangan di area "Catatan", "Kendala", "Notes", atau kotak kosong di bagian bawah form.
- Transkripsikan APA ADANYA. Jangan diperbaiki, jangan dirapikan.
- Jika tidak terbaca: tulis "Tidak terbaca".

LANGKAH 5 — MULTI-VALUE HANDLING:
Jika ada LEBIH DARI SATU nilai untuk field yang sama (misal: 2 nomor HP, 2 email):
- value = nilai yang paling utama / paling jelas
- alternatives = [nilai kedua, nilai ketiga, ...]
- JANGAN buang nilai manapun

LANGKAH 6 — CONFIDENCE:
- high: teks sangat jelas terbaca dan lolos validasi format
- medium: terbaca tapi ada keraguan kecil, atau format tidak sempurna
- low: sulit terbaca, atau tidak lolos guardrails
- empty: field tidak ada di gambar sama sekali

LANGKAH 7 — DATA KONTAK TULISAN TANGAN (PENTING):
Kontak (name, phone, email, company) bisa berasal dari KARTU NAMA CETAK atau dari STIKER/KOLOM yang DIISI TULISAN TANGAN.
- Jika sumbernya CETAK (font rapi, kontras tinggi) → boleh confidence "high".
- Jika sumbernya TULISAN TANGAN (huruf/angka ditulis pena, miring, menyambung) → JANGAN beri "high". Maksimal "medium", dan "low" jika ada digit/huruf yang ambigu.
- PHONE tulisan tangan: angka seperti 1/7, 4/9, 0/6, 3/8, 5/6 sering rancu. Jika ragu pada digit tertentu, turunkan confidence dan berikan bacaan alternatif di alternatives (mis. value "0812..." dengan alternatives varian digit yang ragu).
- EMAIL tulisan tangan: jika ada huruf yang ragu, turunkan confidence; jangan memaksa "high".
- Tujuannya: field kontak tulisan tangan yang ragu HARUS terlihat perlu dicek manual, bukan tampak pasti benar.`;
}
