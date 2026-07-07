# W2U

## Tujuan Dokumen

Dokumen ini menjelaskan cara memakai hasil merge OCR baru setelah branch digabung.

## Konfigurasi Env

Pastikan env OCR berisi nilai berikut.

```text
OPENAI_OCR_MODEL=gpt-4.1
OPENAI_PREFLIGHT_MODEL=gpt-4.1-mini
OPENAI_BOX_SCAN_MODEL=gpt-4.1
OPENAI_IDENTITY_REVIEW_MODEL=gpt-5.5
OPENAI_VERIFIER_MODEL=gpt-4.1
OLLAMA_OCR_MODEL=gemma3:27b
```

Catatan:

1. `OPENAI_VERIFIER_MODEL` disarankan memakai model non reasoning yang stabil.
2. `OPENAI_IDENTITY_REVIEW_MODEL` boleh memakai model flagship visual.
3. `OLLAMA_ENDPOINT` boleh dikosongkan jika fallback tidak ingin dipakai.
4. Setelah env berubah, restart dev server.

## Cara Kerja OCR Baru

1. User mengirim gambar.
2. Preflight mengecek apakah gambar relevan.
3. Jika gambar tidak relevan, proses berhenti.
4. Jika gambar relevan, gambar diupload ke R2.
5. OCR baseline membaca gambar penuh.
6. Box scan membantu saat ada field ragu.
7. Field review membaca ulang field yang ragu.
8. Verifier text only mengecek hasil secara konservatif.
9. Audit skeptis membersihkan hasil tanpa menghapus raw OCR.
10. Validasi lokal email dan perusahaan dijalankan.

## Gambar Yang Diterima

1. Form customer.
2. Form survey.
3. Form event.
4. Kartu nama.
5. Badge peserta.
6. Dokumen lead yang jelas berisi data customer.

## Gambar Yang Ditolak

1. Logo saja.
2. Foto orang.
3. Foto ruangan.
4. Foto produk tanpa data customer.
5. Screenshot chat.
6. Screenshot aplikasi.
7. Gambar kosong.
8. Gambar terlalu gelap atau blur total.

Pesan reject akan seperti ini.

```text
Hmm kayanya ini bukan form kita deh, yang saya lihat hanya logo PIRANUSA dengan slogan.
```

## Cara Handle Return OCR Di UI

Caller wajib cek `rejected` sebelum membaca field OCR.

```ts
const res = await extractCustomerVision({ imageDataUri });

if ('rejected' in res) {
  toast({
    variant: 'destructive',
    title: 'Gambar tidak diproses',
    description: res.message,
  });
  return;
}

setFields({
  name: res.name.value,
  company: res.company.value,
  jobTitle: res.jobTitle.value,
  phone: res.phone.value,
  email: res.email.value,
});
```

## Data Raw Dan Data Validasi

Hasil OCR sekarang membawa data tambahan.

```text
rawOcrResult
localValidation
```

Gunakan `rawOcrResult` jika perlu melihat teks asli dari AI sebelum audit.

Gunakan `localValidation.email` untuk melihat status email.

Contoh status email:

```text
empty
invalid_syntax
valid_syntax_mx_found
valid_syntax_no_mx
valid_syntax_mx_unchecked
```

## Prinsip Email

1. Email raw tidak boleh hilang.
2. Email invalid tetap boleh tampil di form untuk dikoreksi user.
3. Save tetap harus menolak email yang belum valid.
4. DNS MX lookup hanya dipakai jika syntax email sudah valid.
5. Domain email tidak boleh ditebak.

## Prinsip Company

1. Company dari OCR tidak langsung dianggap valid atau invalid.
2. Local validation hanya membandingkan company dengan domain email jika ada.
3. Status company bersifat evidence ringan.
4. Validasi company lebih kuat bisa ditambah lewat Google Places atau crawling domain.

## Cara Test Manual

1. Scan kartu nama atau form customer.
2. Pastikan preflight menerima gambar.
3. Scan gambar logo atau foto random.
4. Pastikan UI menampilkan reject tanpa server crash.
5. Scan gambar dengan email terpotong.
6. Pastikan email tetap muncul untuk koreksi manual.
7. Scan gambar dengan email lengkap.
8. Pastikan `localValidation.email` berisi status syntax dan MX.

## Command Validasi

```text
npm.cmd run typecheck
```

Expected result:

```text
tsc --noEmit
```

Selesai tanpa error.

## Catatan Untuk Merge

1. Jangan revert `src/ai/openai-client.ts` karena sudah berisi dukungan GPT 5 family.
2. Jangan menghapus `preflight.ts` karena itu mencegah upload dan OCR yang tidak relevan.
3. Jangan mengosongkan `rawOcrResult` karena raw data diperlukan untuk audit manual.
4. Jika ada konflik di UI OCR, pastikan branch hasil merge tetap handle return `rejected`.
5. Jika ada konflik di env, pastikan `OLLAMA_OCR_MODEL` tetap dipakai.
