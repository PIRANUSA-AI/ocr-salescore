'use server';

import { callOpenAI } from '@/ai/openai-client';
import { getCustomerById } from '@/app/actions/customer';
import { z } from 'zod';

const CommunicationGenerationInputSchema = z.object({
  customerId: z.string().describe('The ID of the customer to generate communication for.'),
  communicationType: z.enum(['whatsapp', 'email']).describe('The desired communication format.'),
  salesName: z.string().describe('The name of the sales representative.'),
  communicationIntent: z.string().optional().describe("Instruksi atau tujuan spesifik yang ditulis manual oleh sales."),
  additionalContext: z.string().optional().describe("Catatan tambahan dari sales."),
  useCustomerContext: z.boolean().default(true).describe("Whether to use the customer's history as context."),
});

export type CommunicationGenerationInput = z.infer<typeof CommunicationGenerationInputSchema>;

const CommunicationGenerationOutputSchema = z.object({
  generatedHook: z.string().describe('The generated communication message.'),
});

export type CommunicationGenerationOutput = z.infer<typeof CommunicationGenerationOutputSchema>;

async function getCustomerDetails(customerId: string) {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new Error(`Pelanggan dengan ID ${customerId} tidak ditemukan.`);
  }
  return customer;
}

export async function generateCommunicationForCustomer(input: CommunicationGenerationInput): Promise<CommunicationGenerationOutput> {
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
(Instruksi: JANGAN gunakan riwayat produk atau webinar pelanggan dalam membuat pesan ini.)
`;
  }

  const systemPrompt = `Anda adalah seorang sales profesional dan berpengalaman dari Piranusa.
Tugas Anda adalah menganalisis data pelanggan dan membuat SATU draf pesan tindak lanjut (hook) yang paling relevan.
Gunakan gaya komunikasi yang hangat, sopan, profesional, dan natural seperti manusia.
Hindari bahasa kaku, formal berlebihan, atau template massal.
Gunakan sapaan "Bapak/Ibu" di seluruh pesan.

${customerDataContext}
- Format Pesan: **${input.communicationType}**

PROSES BERPIKIR ANDA:
1. Ikuti TUJUAN UTAMA secara ketat. Tujuan ini adalah perintah absolut.
2. Gunakan KONTEKS TAMBAHAN untuk menyesuaikan nada dan gaya.
3. Gaya bahasa: hangat, sopan, profesional, natural, tidak kaku.
4. Perkenalkan diri secara sopan dan profesional.
5. Jangan gunakan gaya SKSD.

ATURAN OUTPUT:
- Buat HANYA SATU draf pesan.
- Jangan tampilkan reasoning.
- Format Email: Awali dengan "Subject: [Judul]\\n\\n", akhiri dengan salam + nama sales.
- Format WhatsApp: Lebih singkat, langsung ke poin, tanpa salam penutup nama sales.
- Output: {"generatedHook": "isi pesan siap kirim"}`;

  const userPrompt = `INSTRUKSI SPESIFIK DARI SALES (PRIORITAS TERTINGGI):
1. TUJUAN UTAMA: "${userGoal}"
2. KONTEKS/CATATAN TAMBAHAN: "${input.additionalContext || 'Tidak ada'}"

Buat pesan komunikasi ${input.communicationType} yang personal untuk ${customer.name}.`;

  const output = await callOpenAI({
    systemPrompt,
    userPrompt,
    schema: CommunicationGenerationOutputSchema,
    temperature: 0.5,
    maxTokens: 1024,
  });

  if (!output) {
    throw new Error("AI gagal membuat pesan komunikasi.");
  }
  return output;
}
