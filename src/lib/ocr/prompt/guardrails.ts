export function buildGuardrailPrompt(): string {
  return `ATURAN VALIDASI PER FIELD — PATUHI DENGAN KETAT:

📞 PHONE:
✓ WAJIB: diawali +62, 62, 08, 021, 022, 031, 061, atau kode area lain
✓ WAJIB: minimal 8 digit (setelah kode area), maksimal 15 digit
✓ BOLEH: spasi, tanda kurung, strip, titik
✗ TIDAK BOLEH: mengandung huruf (kecuali "+" dan "x" untuk extension)
✗ TIDAK BOLEH: nama orang, email, teks biasa
📌 Jika ada 2+ nomor: value = nomor utama, alternatives = [nomor lain]

📧 EMAIL:
✓ WAJIB: mengandung @
✓ WAJIB: mengandung domain valid (.com, .co.id, .net, .org, .ac.id, .or.id, .gov, .sch.id)
✗ TIDAK BOLEH: hanya nama tanpa @
✗ TIDAK BOLEH: nomor HP
📌 Jika ada 2+ email: value = email utama, alternatives = [email lain]

👤 NAME:
✗ TIDAK BOLEH: format nomor HP
✗ TIDAK BOLEH: mengandung @
✗ TIDAK BOLEH: hanya angka
✓ IDEALNYA: terdiri dari 2+ kata (nama depan + belakang)
✓ BOLEH: 1 kata jika memang hanya itu yang terbaca

🏢 COMPANY:
✗ TIDAK BOLEH: format nomor HP
✗ TIDAK BOLEH: format email  
✗ TIDAK BOLEH: sama persis dengan NAME
✓ CIRI: diakhiri PT, CV, UD, atau nama merek/usaha

💼 JOB TITLE:
✗ TIDAK BOLEH: format nomor HP atau email
✓ CIRI: Manager, Direktur, Engineer, Staff, Owner, GM, VP, Head, Lead, Specialist

🏛️ DIVISION:
✗ TIDAK BOLEH: sama dengan JOB TITLE
✓ CIRI: Finance, IT, Marketing, HRD, Produksi, Engineering

💻 SOFTWARE NEEDS:
✓ CIRI: nama software CAD/engineering yang dikenal
✗ TIDAK BOLEH: nama perusahaan (kecuali software bernama sama)
✗ TIDAK BOLEH: teks umum yang bukan nama software

ATURAN GLOBAL:
❌ JANGAN PERNAH mengisi value dengan: "tidak ada", "-", "unknown", "none", "N/A", "Tidak tersedia", "null", "undefined"
❌ JANGAN PERNAH mengarang data yang tidak terbaca di gambar
❌ JANGAN MEMAKSA. Jika sebuah field terisi tapi isinya jelas TIDAK MASUK AKAL untuk field itu (contoh: kolom DIVISI berisi "@gmail.com" lanjutan dari email di atas), KOSONGKAN SAJA.
❌ JANGAN MEMINDAHKAN DATA YANG TIDAK JELAS ASALNYA. Jika ragu sebuah teks milik field mana, lebih baik tidak diisi.
✅ KOSONG LEBIH BAIK DARI PADA SALAH PAKSA. Value = "", confidence = "empty" adalah hasil yang valid dan jujur.
✅ Jika field benar-benar tidak ada atau tidak jelas → value = "", confidence = "empty", alternatives = []
✅ Jika field kosong di gambar → value = "", confidence = "empty"`;
}
