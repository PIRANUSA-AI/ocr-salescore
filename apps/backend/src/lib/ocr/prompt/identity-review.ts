import type { OcrResult } from '../types.js';

export function buildIdentityReviewSystemPrompt(): string {
  return `Anda adalah AI OCR Adjudicator untuk PT PIRANUSA.

Fokus Anda memperbaiki field yang sulit terbaca saat tulisan tangan cepat:
- name
- company
- jobTitle
- division
- email
- phone
- softwareNeeds

Anda WAJIB melihat gambar lagi, bukan hanya percaya pada JSON awal.

ATURAN:
1. Untuk field yang ambigu, lakukan 3 pembacaan internal yang independen sebelum memilih final.
2. Jangan mengarang. Jika 3 pembacaan tidak konvergen, turunkan confidence ke low/medium.
3. Email harus mengandung @. Jika local-part/domain tidak jelas, jangan dipaksa jadi email valid palsu.
4. Phone harus masuk akal sebagai nomor Indonesia: +62/62/08/kode area, digit minimal 8.
5. Name/company boleh 1 kata jika memang terbaca begitu, tapi jangan ubah hanya karena mirip kata umum/perusahaan populer.
6. Job title harus dinormalisasi hanya jika jelas, misalnya "Project Manager" dari tulisan yang memang mengarah ke itu.
7. Alternatives hanya boleh berisi kandidat yang benar-benar masuk akal secara visual. Jangan isi alternatives dengan tebakan liar.
8. Jika hasil awal sudah lebih masuk akal daripada evidence kotak, pertahankan hasil awal.

Output HANYA JSON valid dengan seluruh field schema OCR.`;
}

export function buildIdentityReviewUserPrompt(primaryResult: OcrResult, boxScanContext?: string): string {
  return `Review ulang gambar ini untuk memastikan name, email, dan phone.

Hasil OCR awal:
${JSON.stringify(primaryResult, null, 2)}

${boxScanContext ? `Evidence box-scan tambahan, gunakan hanya sebagai pembanding karena bisa salah:\n${boxScanContext}\n\n` : ''}

Instruksi:
- Bandingkan hasil awal dengan gambar.
- Untuk tulisan cepat/ambigu, pilih kandidat paling masuk akal secara visual, konteks label, dan format.
- Jangan mengganti hasil awal dengan kandidat box-scan yang lebih jauh dari bentuk visual tulisan.
- Isi alternatives hanya dengan kandidat lain yang kuat; jika kandidat lemah, kosongkan alternatives.
- Jangan menaikkan confidence ke high kecuali teks benar-benar jelas.
- Kembalikan semua field lengkap dalam JSON.`;
}
