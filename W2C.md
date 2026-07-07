# W2C

## Tujuan Perubahan

Dokumen ini merangkum perubahan kode yang perlu diperhatikan saat merge ke branch lain.

## Area Utama

1. Pipeline OCR customer.
2. Validasi gambar sebelum OCR.
3. Validasi lokal untuk email dan perusahaan.
4. Perbaikan konfigurasi model OpenAI.
5. Penanganan reject gambar yang bukan form atau kartu customer.

## Perubahan OCR

1. Alur OCR utama tetap memakai pembacaan gambar penuh sebagai baseline.
2. Box scan hanya dipakai sebagai bantuan saat field tertentu ragu.
3. Box scan tidak lagi menjadi sumber kebenaran utama.
4. Field review dengan model visual dapat memperbaiki field yang ragu, tetapi tidak boleh mengganti baseline jika confidence tidak lebih baik.
5. Verifier text only dibuat lebih konservatif.
6. Audit skeptis selalu dijalankan sebelum hasil dikembalikan ke UI.

## Preflight Gambar

1. Ditambahkan pemeriksaan awal untuk menentukan apakah gambar relevan dengan OCR customer.
2. Gambar yang bukan form customer, kartu nama, badge peserta, atau dokumen lead langsung ditolak.
3. Gambar yang ditolak tidak diupload ke R2.
4. Gambar yang ditolak tidak masuk proses OCR berat.
5. Pesan reject memakai format manusiawi, contohnya:

```text
Hmm kayanya ini bukan form kita deh, yang saya lihat hanya logo PIRANUSA dengan slogan.
```

## Validasi Lokal

1. Ditambahkan validasi email lokal tanpa API berbayar.
2. Validasi email memakai syntax check dan DNS MX lookup.
3. Raw OCR tetap disimpan sebelum audit.
4. Email yang belum valid tetap tampil untuk koreksi manual.
5. Status validasi email disimpan di `localValidation.email`.
6. Status validasi perusahaan disimpan di `localValidation.company`.

## Audit Skeptis

1. Nama yang terlihat seperti artefak OCR dapat diperbaiki secara konservatif.
2. Jabatan terpotong seperti `Project man` dapat diperbaiki menjadi `Project Manager`.
3. Email personal dibandingkan dengan nama.
4. Local part email yang jelas artefak OCR dapat diperbaiki agar konsisten dengan nama.
5. Domain email tidak dibuat atau ditebak.
6. Alternatives yang tidak masuk akal difilter.

## Konfigurasi OpenAI

1. Client OpenAI sekarang membedakan model lama dan model GPT 5 family.
2. GPT 5 family memakai `max_completion_tokens`.
3. GPT 5 family tidak dikirim parameter `temperature`.
4. Model yang hanya mendukung Responses API diberi error eksplisit jika dipakai lewat Chat Completions.
5. Error API OpenAI sekarang menyertakan pesan dari provider.

## Perubahan UI

1. Flow OCR sekarang bisa mengembalikan hasil reject terkontrol.
2. UI menangani hasil reject sebagai kondisi normal.
3. Reject gambar tidak lagi menyebabkan server action terlihat crash.
4. Caller yang diperbarui:

```text
src/app/dashboard/leader/components/ocr-capture-view.tsx
src/app/dashboard/leader/components/ocr-import-dialog.tsx
```

## File Baru

```text
src/lib/ocr/preflight.ts
src/lib/ocr/box-scan.ts
src/lib/ocr/identity-review.ts
src/lib/ocr/local-validation.ts
src/lib/ocr/skeptic-audit.ts
```

Catatan: lokasi prompt baru berada di folder `src/lib/ocr/prompt`.

## File Yang Diubah

```text
src/ai/openai-client.ts
src/ai/flows/extract-customer-vision.ts
src/lib/ocr/extract.ts
src/lib/ocr/openai-provider.ts
src/lib/ocr/ollama-provider.ts
src/lib/ocr/types.ts
src/lib/ocr/prompt/guardrails.ts
src/lib/ocr/prompt/template.ts
src/app/dashboard/leader/components/ocr-capture-view.tsx
src/app/dashboard/leader/components/ocr-import-dialog.tsx
.env.local
```

## Risiko Merge

1. Branch lain yang mengubah `extractCustomerVision` perlu menyesuaikan return type baru.
2. Caller harus mengecek properti `rejected` sebelum membaca field OCR.
3. Branch lain yang memakai `OcrProvider.extract` harus menerima parameter opsional `extraContext`.
4. Jika branch lain mengubah env OCR, pastikan nama env `OLLAMA_OCR_MODEL` dipakai, bukan `OLLAMA_MODEL`.
5. Jika branch lain mengubah OpenAI client, pastikan dukungan GPT 5 family tetap dipertahankan.

## Validasi Yang Sudah Dilakukan

```text
npm.cmd run typecheck
```

Hasil terakhir: pass.
