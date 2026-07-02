/**
 * @fileOverview A Genkit flow for generating a dynamic sales opportunity for a customer.
 */
'use server';

import { ai } from '@/ai/genkit';
import { type Customer, type OpportunityTask, PRODUCT_LIST, ProductName } from '@/types';
import { z } from 'zod';
import { randomUUID } from 'crypto';

// -------- ZOD SCHEMAS --------

const OpportunityGenerationInputSchema = z.custom<Customer>();

// We are only generating ONE opportunity, the BEST one.
const OpportunityGenerationOutputSchema = z.object({
    isOpportunity: z.boolean().describe("Apakah ada peluang cross-sell/upsell yang layak untuk pelanggan ini."),
    recommendedProduct: z.enum(PRODUCT_LIST).optional().describe("Produk yang direkomendasikan."),
    reason: z.string().optional().describe("Alasan strategis yang kuat dan personal mengapa produk ini harus ditawarkan sekarang."),
    triggeringProduct: z.enum(PRODUCT_LIST).optional().describe("Produk yang sudah dimiliki yang memicu peluang ini."),
});


// -------- GENKIT FLOW --------

export async function generateOpportunityForCustomer(customer: Customer): Promise<OpportunityTask | null> {
    const result = await generateOpportunityFlow(customer);
    
    if (!result.isOpportunity || !result.recommendedProduct || !result.triggeringProduct || !result.reason) {
        return null;
    }

    return {
        id: randomUUID(),
        customerId: customer.id,
        customerName: customer.name,
        customerCompany: customer.company || '',
        assignedSalesId: customer.assignedSalesId,
        assignedSalesName: customer.assignedSalesName || null,
        recommendedProduct: result.recommendedProduct,
        triggeringProduct: result.triggeringProduct,
        reason: result.reason,
    };
}


const generateOpportunityFlow = ai.defineFlow(
  {
    name: 'generateOpportunityFlow',
    inputSchema: OpportunityGenerationInputSchema,
    outputSchema: OpportunityGenerationOutputSchema,
  },
  async (customer) => {

    const customerProducts = customer.products.map(p => `- ${p.name} (Qty: ${p.quantity}, Version: ${p.version || 'N/A'}, Purchase Date: ${p.purchaseDate})`).join('\n');

    const prompt = `
      **Konteks:** Anda adalah seorang Sales Strategist yang sangat berpengalaman. Tugas Anda adalah menganalisis data satu pelanggan untuk menemukan satu peluang cross-sell atau upsell terbaik.

      **Tujuan:** Identifikasi satu peluang penjualan yang paling menjanjikan dan buat alasan yang kuat untuk menghubungi pelanggan.

      **Data Pelanggan:**
      - Nama: ${customer.name}
      - Jabatan: ${customer.jobTitle}
      - Perusahaan: ${customer.company}
      - Produk yang Dimiliki:
      ${customerProducts}
      - Bergabung Sejak: ${customer.createdAt}

      **Aturan Analisis & Logika:**
      1.  **Cari Peluang:** Tinjau produk yang dimiliki pelanggan. Apakah ada produk pelengkap atau versi yang lebih tinggi yang bisa ditawarkan?
          *   **Aturan Cross-sell 1:** Jika pelanggan punya "Sketchup" tapi TIDAK punya produk rendering (D5 Render, V-Ray, Enscape, Corona), ini adalah peluang untuk "D5 Render".
          *   **Aturan Cross-sell 2:** Jika pelanggan punya "ZWCAD" tapi TIDAK punya "ZW3D", ini adalah peluang untuk "ZW3D".
          *   Jika tidak ada peluang yang jelas, set "isOpportunity" ke false.
      2.  **Buat Alasan yang Kuat & Personal (Jika ada peluang):** Ini adalah bagian terpenting. JANGAN gunakan alasan generik. Gunakan data pelanggan untuk membuat alasan yang spesifik. Pertimbangkan:
          *   **Lama Penggunaan:** "Telah menjadi pengguna setia ZWCAD selama 2 tahun, sekarang adalah waktu yang tepat untuk memperkenalkan efisiensi desain 3D dengan ZW3D."
          *   **Kuantitas:** "Dengan 5 lisensi Sketchup di timnya, D5 Render akan merevolusi alur kerja visualisasi kolaboratif mereka."
          *   **Jabatan:** "Sebagai seorang 'Project Architect', beliau akan sangat menghargai kecepatan visualisasi real-time yang ditawarkan D5 Render."
      3.  **Format Output:**
          -   Hasilkan objek JSON valid dengan field "isOpportunity", "recommendedProduct", "reason", dan "triggeringProduct".
          -   Jika tidak ada peluang, "isOpportunity" harus false, dan field lain boleh kosong.
    `;

    try {
        const { output } = await ai.generate({
          prompt,
          model: 'googleai/gemini-2.5-flash',
          output: { schema: OpportunityGenerationOutputSchema },
        });

        if (!output) {
          throw new Error("AI gagal menganalisis peluang untuk pelanggan.");
        }
        return output;

    } catch (error) {
        console.error(`[Flow: generateOpportunityFlow] Gagal untuk pelanggan ${customer.id} (${customer.name}):`, error);
        // Return a non-opportunity result instead of throwing an error
        return { isOpportunity: false };
    }
  }
);
