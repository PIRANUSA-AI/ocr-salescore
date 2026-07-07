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

LANGKAH 4 — FORM DETECTION (FORM CUSTOMER PT PIRANUSA):
Jika gambar berisi area form dengan pertanyaan berikut (baik form berdiri sendiri maupun form dengan kartu nama tertempel), cocokkan JAWABAN ke PERTANYAAN berikut secara PERSIS berdasarkan teks pertanyaan (bukan urutan/posisi, karena kartu nama tertempel bisa menutupi sebagian layout).

WAJIB: formAnswers HARUS berisi SEMUA 11 pertanyaan di bawah ini, TANPA KECUALI, setiap kali form terdeteksi di gambar — bukan hanya yang jawabannya jelas atau tercentang. Pertanyaan yang tidak ada centang/tulisan sama sekali TETAP dimasukkan dengan answer = "" (lihat ATURAN PENCOCOKAN). JANGAN melewatkan (skip) satu pertanyaan pun hanya karena raguragu atau checkbox terlihat kosong — cek ulang gambar sebelum menyimpulkan kosong.

1. "Prioritas Pelanggan" — pilihan: High, Medium, Low. Jika tidak ada yang ditandai, answer = "none".
2. "Industri perusahaan?" — pilihan: Arsitektur, Interior, Kontraktor, Developer, Lainnya: [tulisan tangan].
3. "Apa posisi saat ini?" — pilihan: Owner, Direktur, Arsitek, Engineer, Lainnya: [tulisan tangan].
4. "Produk apa yang paling Anda minati?" — pilihan: ZWCAD, SketchUp, Archicad, Enscape, V-Ray, D5 Render. Boleh lebih dari satu kotak tercentang.
5. "Saat ini software apa yang digunakan?" — pilihan: AutoCAD, SketchUp, Revit, Archicad, Lainnya: [tulisan tangan]. Boleh lebih dari satu kotak tercentang.
6. "Tujuan penggunaan software?" — pilihan: Gambar 2D, Desain 3D, BIM, Rendering, Lainnya: [tulisan tangan]. Boleh lebih dari satu kotak tercentang.
7. "Berapa jumlah pengguna software di perusahaan?" — pilihan: <5, 5-10, >10.
8. "Kapan rencana upgrade / pembelian software?" — pilihan: <3 bulan, 3-6 bulan, >6 bulan, Belum ada rencana.
9. "Apakah bersedia untuk Demo Produk?" — pilihan: Ya, Tidak.
10. "Apa kendala saat ini dalam proses design" — jawaban tulisan tangan bebas, transkripsikan apa adanya.
11. "Note Tambahan" — tulisan tangan bebas di kotak catatan, transkripsikan apa adanya. Jika kotak kosong, answer = "".

ATURAN PENCOCOKAN:
- Untuk checkbox/centang: tulis TEKS PILIHAN PERSIS seperti tercetak sebagai answer (jangan parafrase).
- Untuk "Lainnya" tercentang DAN ada tulisan tangan mengikutinya: answer = "Lainnya: <tulisan>".
- Untuk "Lainnya" tercentang TANPA tulisan tangan: answer = "Lainnya" saja.
- Untuk pertanyaan dengan LEBIH DARI SATU kotak tercentang: gabungkan semua pilihan yang tercentang dipisah koma, JANGAN memilih satu secara sepihak.
- Untuk pertanyaan checkbox yang TIDAK ada satupun tercentang (selain "Prioritas Pelanggan"): answer = "" (bukan "none", bukan "-", jangan mengarang jawaban).
- answer = "" BUKAN alasan untuk menghilangkan pertanyaan dari formAnswers — pertanyaan tetap WAJIB ada sebagai entri dengan answer kosong.
- JANGAN membuat pertanyaan baru yang tidak ada di daftar ini.
- JANGAN ekstrak nama sales atau data non-pelanggan.
- Jika gambar TIDAK berisi form ini sama sekali (misal hanya kartu nama polos), JANGAN kembalikan formAnswers untuk pertanyaan-pertanyaan di atas — cukup array kosong.

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
