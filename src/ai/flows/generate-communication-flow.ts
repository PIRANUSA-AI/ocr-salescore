/**
 * @fileOverview A Genkit flow for generating personalized communication hooks
 * for sales representatives. This version allows for explicit intent and context from the user.
 */
'use server';

import { ai } from '@/ai/genkit';
import { getCustomerById } from '@/app/actions/customer';
import { adminDb } from '@/lib/firebase-admin';
import { Customer } from '@/types';
import { z } from 'zod';

// -------- ZOD SCHEMAS --------

const CommunicationGenerationInputSchema = z.object({
  customerId: z.string().describe('The ID of the customer to generate communication for.'),
  communicationType: z.enum(['whatsapp', 'email']).describe('The desired communication format.'),
  salesName: z.string().describe('The name of the sales representative.'),
  communicationIntent: z.string().optional().describe("Instruksi atau tujuan spesifik yang ditulis manual oleh sales."),
  additionalContext: z.string().optional().describe("Catatan tambahan dari sales (contoh: 'Orangnya sibuk', 'Buat bahasa lebih santai')."),
  useCustomerContext: z.boolean().default(true).describe("Whether to use the customer's history (products, webinars) as context."),
});

export type CommunicationGenerationInput = z.infer<typeof CommunicationGenerationInputSchema>;

const CommunicationGenerationOutputSchema = z.object({
  generatedHook: z.string().describe('The generated communication message. If email, it should start with "Subject: <subject_line>\\n\\n".'),
});

export type CommunicationGenerationOutput = z.infer<typeof CommunicationGenerationOutputSchema>;


// -------- HELPER: FETCH CUSTOMER DATA --------

async function getCustomerDetails(customerId: string): Promise<Customer> {
  console.log(`[Flow Helper: getCustomerDetails] Membaca dokumen pelanggan: ${customerId}`);
  const customer = await getCustomerById(customerId);
  if (!customer) {
    console.error(`[Flow Helper: getCustomerDetails] GAGAL. Pelanggan dengan ID ${customerId} tidak ditemukan.`);
    throw new Error(`Pelanggan dengan ID ${customerId} tidak ditemukan.`);
  }
  console.log(`[Flow Helper: getCustomerDetails] SUKSES. Pelanggan ${customerId} ditemukan.`);
  return customer;
}


// -------- GENKIT FLOW --------

export async function generateCommunicationForCustomer(input: CommunicationGenerationInput): Promise<CommunicationGenerationOutput> {
  return generateCommunicationFlow(input);
}


const generateCommunicationFlow = ai.defineFlow(
  {
    name: 'generateCommunicationFlow',
    inputSchema: CommunicationGenerationInputSchema,
    outputSchema: CommunicationGenerationOutputSchema,
  },
  async (input) => {
    const customer = await getCustomerDetails(input.customerId);

    const userGoal = input.communicationIntent || 'Analisis data pelanggan dan tentukan langkah terbaik.';

    let customerDataContext = '';
    if (input.useCustomerContext) {
        customerDataContext = `
**DATA PELANGGAN & SALES:**
- Nama Pelanggan: ${customer.name}
- Jabatan: ${customer.jobTitle}
- Perusahaan: ${customer.company}
- Produk Dimiliki: ${customer.products.map(p => p.name).join(', ') || 'Belum ada'}
- Riwayat Webinar: ${customer.webinarHistory?.map(w => w.webinarTitle).join(', ') || 'Tidak ada'}
- Nama Sales: ${input.salesName}
`;
    } else {
        customerDataContext = `
**DATA PELANGGAN & SALES:**
- Nama Pelanggan: ${customer.name}
- Nama Sales: ${input.salesName}
(Instruksi: JANGAN gunakan riwayat produk atau webinar pelanggan dalam membuat pesan ini. Fokus hanya pada tujuan dari sales).
`;
    }

    const prompt = `
**INSTRUKSI UTAMA:**
Anda adalah seorang sales profesional dan berpengalaman dari Piranusa.
Tugas Anda adalah menganalisis data pelanggan dan membuat SATU draf pesan tindak lanjut (hook) yang paling relevan.
Gunakan gaya komunikasi yang hangat, sopan, profesional, dan natural seperti manusia.
Hindari bahasa kaku, formal berlebihan, atau template massal.
Gunakan sapaan "Bapak/Ibu" di seluruh pesan.

${customerDataContext}
- Format Pesan: **${input.communicationType}**

---

**INSTRUKSI SPESIFIK DARI SALES (PRIORITAS TERTINGGI):**
1. **TUJUAN UTAMA:** "${userGoal}"
2. **KONTEKS/CATATAN TAMBAHAN:** "${input.additionalContext || 'Tidak ada'}"

---

**PROSES BERPIKIR ANDA (WAJIB DIIKUTI):**
1. **Ikuti TUJUAN UTAMA secara ketat.**
   Tujuan ini adalah perintah absolut. Fokus membuat pesan yang benar-benar mencapai tujuan tersebut.
   Jangan menambah atau mengubah tujuan.

2. **Gunakan KONTEKS TAMBAHAN untuk menyesuaikan nada dan gaya.**
   - Jika sales bilang “buat lebih formal” → gunakan formal.
   - Jika sales bilang “pelanggannya sibuk” → buat sangat singkat.
   - Jika sales bilang “buat ringan tapi tetap sopan” → sesuaikan.

3. **Gaya bahasa wajib:**
   - Hangat, sopan, profesional.
   - Natural seperti manusia, tidak kaku.
   - Tidak terlalu formal seperti surat dinas.
   - Tidak menggunakan frasa yang terlalu dekat seperti “nih”, “ya kak”, “he he”, atau bahasa gaul lainnya.
   - Hindari kalimat yang terkesan SKSD seperti “dari Piranusa nih”, “saya mau tanya dong”, atau “halo ya”.

4. **Identitas Sales:**
   - Perkenalkan diri secara sopan dan profesional.
   - Gunakan format seperti:
     - “Saya ${input.salesName} dari Piranusa,”
     - atau “Perkenalkan, saya ${input.salesName} dari Piranusa.”
   - Jangan gunakan gaya SKSD apa pun.

---

**ATURAN OUTPUT (SANGAT PENTING):**
- Buat **HANYA SATU** draf pesan berdasarkan TUJUAN UTAMA.
- Jangan tampilkan reasoning atau proses berpikir Anda.
- Hasilkan hanya isi pesan yang sudah siap kirim.

- **Format Email:**
  - Awali dengan: \`Subject: [Judul Email Anda]\`
  - Beri dua baris kosong (\`\\n\\n\`) setelah subject.
  - Akhiri dengan salam profesional + nama sales.
  - Contoh:  
    "Terima kasih,  
    ${input.salesName}"

- **Format WhatsApp:**
  - Lebih singkat, langsung ke poin.
  - Tidak perlu salam penutup dengan nama sales (WhatsApp sudah menampilkan nama pengirim secara otomatis).

- **Output Akhir:**
  Hasilkan *HANYA* objek JSON valid:
  {
    "generatedHook": "isi pesan siap kirim"
  }
    `;

    console.log(`[Flow: generateCommunicationFlow] Memanggil AI untuk pelanggan ${customer.id}`);
    const { output } = await ai.generate({
      prompt,
      model: 'googleai/gemini-2.5-flash',
      output: { schema: CommunicationGenerationOutputSchema },
    });

    if (!output) {
      console.error(`[Flow: generateCommunicationFlow] AI gagal membuat pesan untuk pelanggan ${customer.id}`);
      throw new Error("AI gagal membuat pesan komunikasi.");
    }
    console.log(`[Flow: generateCommunicationFlow] SUKSES. Pesan AI berhasil dibuat untuk pelanggan ${customer.id}`);
    return output;
  }
);
