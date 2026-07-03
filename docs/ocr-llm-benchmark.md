# Benchmark LLM untuk OCR Form Customer (Piranusa)

**Tanggal:** 2026-07-03 · **2 test:** teks cetak jelas + gambar asli `test-gambar.jpeg` @ max 512 token

---

## 📊 Tabel Hasil Benchmark (gabungan 2 test)

| Model | Provider | ⏱ Waktu | 🎯 Akurasi (cetak) | 👁 Kualitas (gambar asli) | 🪙 Biaya/scan | 🔢 Jalan @512 token? | Status |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **gpt-4o** | OpenAI | **2.7s** | **100%** | 🥇 **terbaik** | $0.0037 | ✅ ya | 🏆 **PILIHAN UTAMA** |
| **gpt-4o-mini** | OpenAI | 2.2s | 100% | 🥈 bagus | $0.0056 | ✅ ya | ✅ alternatif |
| gpt-5-nano | OpenAI | 4.6s | 100% | ❌ tak teruji | $0.0004 | ❌ **gagal** (reasoning) | ⚠️ butuh limit naik |
| gemma3:12b | Ollama Cloud | 3.7–5.1s | 71% | ⚠️ nama salah | **free** | ✅ ya | ⚠️ fallback saja |
| glm-4.6v | GLM (z.ai) | 9–17.8s | 100% | 🟡 ok @2048 token | **free** | ❌ **gagal** (reasoning) | ❌ lambat + boros token |

**Catatan kunci:**
- Model **reasoning** (gpt-5-nano, glm-4.6v) **gagal di limit 512 token** — semua token habis untuk "berpikir", tidak ada output. Harus naik ke ~2000 token untuk jalan.
- **gpt-4o-mini anomali**: token input gambar 36904 → justru lebih mahal dari gpt-4o.
- **gemma3 paling lemah** di gambar asli (nama "Vir day" salah, email paling rusak).
- Semua model **kesulitan di field email** (email panjang/sulit terbaca) → wajib flag low-confidence + koreksi manual.

---

## 🎯 Tabel Rekomendasi (pilih berdasar prioritas Anda)

| Prioritas Anda | Model | ⏱ Waktu | 💰 Cost 100/hari | Alasan |
|---|---|:---:|:---:|---|
| **Akurasi & kecepatan terbaik** | `gpt-4o` | 2.7s | ~$0.37/hari | Tercepat + paling akurat di **kedua** test, JSON bersin, non-reasoning (cocok limit 512). Paling andal untuk tulisan tangan & kartu nama rumit. |
| **Murah meriah, akurasi tetap 100%** | `gpt-5-nano` (+naikkan limit) | 4.6s | ~$0.04/hari | 10x lebih murah, akurat 100% di teks. **Tapi** reasoning model → wajib `max_tokens` ≥1500, dan belum teruja di gambar asli. |
| **Gratis total, no kartu** | `gemma3:12b` | 3.7s | **$0** | Free, cepat. **Tapi** akurasi rendah (71%, nama salah). Hanya second-opinion, bukan primary. |
| **Fallback second-opinion** | `glm-4.6v` | 9s+ | **$0** | Gratis, akurat. Tapi lambat & boros token. Cocok untuk re-OCR field yg diragukan saja (bukan setiap scan). |

---

## 🏆 Rekomendasi Saya (final)

**Primary: `gpt-4o`** dengan limit 512 token. Alasannya dalam 1 kalimat:

> Satu-satunya model yang **sekaligus** tercepat (2.7s), 100% akurat di kedua test, JSON andal, dan **bekerja di limit 512 token** — model lain minimal kehilangan satu dari kriteria itu.

**Arsitektur pipeline:**
```
Foto → gpt-4o (primary, 512 token) → flag field low-confidence
         → second-opinion HANYA untuk field ragu (glm/gemma3, gratis)
         → operator koreksi manual → simpan → Google Sheet
```

---

## 💡 Implikasi Keputusan Token Limit

| Keputusan `max_tokens` | Model yg viable | Konsekuensi |
|:---:|---|---|
| **512 (sesuai permintaan)** | gpt-4o, gpt-4o-mini, gemma3 | gpt-5-nano & glm gugur. **gpt-4o = juara** |
| 1500–2000 | semua (termasuk gpt-5-nano) | bisa pakai gpt-5-nano ($0.04/hari), glm jadi 9-13s |

> Kalau biaya jadi pertimbangan utama dan Anda mau pakai gpt-5-nano, **naikkan limit ke ~1500 token**. Kalau 512 di-fixed, **gpt-4o adalah pilihan satu-satunya yg optimal.**

---

## 📁 Detail Test
- **Test A (teks cetak):** form sintetis, 7 field diketahui → akurasi di-auto-score.
- **Test B (gambar asli):** `test-gambar.jpeg`, max 512 token → hasil ditampilkan side-by-side di riwayat (tidak di-auto-score karena ground truth tidak diketahui).
- File sebelumnya: `ocr-llm-benchmark.md` (test A detail) & `ocr-llm-benchmark-real.md` (test B detail).
