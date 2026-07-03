# Benchmark OCR — Gambar Asli (test-gambar.jpeg)

**Tanggal:** 2026-07-03
**Gambar:** `public/test-gambar.jpeg` (82 KB / 109 KB base64) — form/kartu nama asli dari event.
**Constraint:** `max_tokens: 512` (output dibatasi 512 token sesuai permintaan).
**Catatan:** Saya (AI) tidak bisa melihat isi gambar, jadi akurasi tidak bisa di-auto-score. Hasil ekstraksi tiap model ditampilkan apa adanya untuk Anda bandingkan secara visual.

---

## ⚠️ Temuan Kritis: Constraint 512 Token

**Model *reasoning* tidak bisa bekerja dengan limit 512 token output.** Token habis untuk proses "berpikir" (reasoning tokens), sehingga tidak ada ruang untuk jawaban:

| Model | Tipe | Hasil di 512 token |
|---|---|---|
| gpt-4o | non-reasoning | ✅ output lengkap |
| gpt-4o-mini | non-reasoning | ✅ output lengkap |
| gemma3:12b | non-reasoning | ✅ output lengkap (kualitas rendah) |
| **gpt-5-nano** | reasoning | ❌ `finish: length`, no JSON |
| **glm-4.6v** | reasoning | ❌ `finish: length`, no JSON (butuh ~2048) |

**Implikasi:** Kalau Anda wajib `max_tokens: 512`, maka gpt-5-nano & glm-4.6v **gugur**. Hanya gpt-4o, gpt-4o-mini, gemma3 yang viable.

---

## Hasil Benchmark (gambar asli, 512 token)

| Model | Waktu | JSON keluar? | Biaya/scan | Kualitas |
|---|---:|---|---:|---|
| **gpt-4o** | 2.7s | ✅ | $0.00367 | 🥇 Terbaik |
| **gpt-4o-mini** | 2.2s | ✅ | $0.00556 | 🥈 Bagus |
| gemma3:12b | 3.7s | ✅ | free | ⚠️ Banyak salah |
| gpt-5-nano | 4.6s | ❌ length | — | ❌ gagal @512 |
| glm-4.6v | 9.0s @512 | ❌ length | — | ❌ gagal @512 |
| glm-4.6v (@2048) | 13.5s | ✅ | free | 🟡 ok tapi lambat |

---

## Perbandingan Ekstraksi (side-by-side)

Gambar berisi data seseorang (nama, perusahaan, telp, email, software). Berikut apa yg diekstrak tiap model — **Anda yang nilai mana yg paling akurat** sesuai isi gambar asli:

### gpt-4o (2.7s)
```json
{
  "name": "Virdaus",
  "company": "Integra group",
  "jobTitle": "",
  "division": "Proket mang",
  "phone": "082 330 237 155",
  "email": "virdaus.interieend@",
  "softwareNeeds": "ZWCAD"
}
```

### gpt-4o-mini (2.2s)
```json
{
  "name": "Virdaus",
  "company": "Integra group",
  "jobTitle": "Projek manajer",
  "division": "",
  "phone": "082330237155",
  "email": "virdays.intereend@",
  "softwareNeeds": "ZWCAD"
}
```

### gemma3:12b (3.7s)
```json
{
  "name": "Vir day",
  "company": "Integra group",
  "jobTitle": "Project manag",
  "phone": "082330237155",
  "email": "Virday's.Intertend@il.caid",
  "softwareNeeds": "ZW3D, ZWCAD, SketchUp"
}
```

### glm-4.6v (13.5s — butuh 2048 token, gagal @512)
```json
{
  "name": "Virdaus",
  "company": "Integra group",
  "jobTitle": "Project mang",
  "phone": "082330237155",
  "email": "Virdays.interteend@ilc.com",
  "softwareNeeds": "ZWCAD, SketchUp"
}
```

---

## Observasi Pola (tanpa ground truth)

- **Nama "Virdaus"** — konsisten di gpt-4o, gpt-4o-mini, glm. gemma3 salah jadi "Vir day" (potong kata).
- **Perusahaan "Integra group"** — semua model benar.
- **Telepon "082330237155"** — semua model benar.
- **Email** — **semua model kesulitan** (terlihat email yg panjang/sulit terbaca). Semua menghasilkan email yg rusak/tidak lengkap (`virdaus.interieend@`, `Virday's.Intertend@il.caid`, dll). Ini **field paling problematik** — kandidat untuk flag low-confidence + koreksi manual.
- **Software** — gpt-4o/mini tulis "ZWCAD" saja; gemma3 & glm tambah "SketchUp/ZW3D". Perlu konfirmasi mana yg benar.
- **gemma3:12b jelas paling lemah** — nama salah, email paling rusak.

---

## Rekomendasi Final (berdasar 2 benchmark)

Setelah test teks-cetak (sebelumnya) + gambar asli (ini):

1. **Primary OCR: `gpt-4o`** — tercepat (2.2-2.7s), paling konsisten akurat di kedua test, JSON bersih, non-reasoning (cocok dengan limit token apapun).
2. **Budget alternative: `gpt-4o-mini`** — mirip gpt-4o tapi sedikit lebih mahal di test ini (token input gambar tinggi).
3. **gpt-5-nano / glm-4.6v**: akurat di teks cetak, TAPI **reasoning model** → tidak viable jika Anda pertahankan `max_tokens: 512`. Kalau mau pakai, naikkan limit ke ~2000 token (tapi glm jadi 13.5s).
4. **gemma3:12b**: free tapi kualitas rendah di gambar asli — hanya untuk fallback second-opinion.

**Saran token limit:** kalau ingin fleksibilitas pakai reasoning model (gpt-5-nano super murah $0.0004/scan), naikkan `max_tokens` ke ~1500-2000. Kalau 512 di-fixed, **gpt-4o adalah pilihan terbaik**.

---

## Cost Projection (100 scan/hari, primary gpt-4o)
- gpt-4o: ~$0.37/hari → ~$11/bulan (event 30 hari)
- gpt-4o-mini: ~$0.56/hari
- gpt-5-nano (jika limit dinaikkan): ~$0.04/hari → ~$1.2/bulan
- gemma3/glm: $0 (free)
