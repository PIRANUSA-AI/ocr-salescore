'use server';

import { callOpenAI } from '@/ai/openai-client';
import { type Customer, type OpportunityTask, PRODUCT_LIST } from '@/types';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const OpportunityGenerationOutputSchema = z.object({
    isOpportunity: z.boolean().describe("Apakah ada peluang cross-sell/upsell yang layak untuk pelanggan ini."),
    recommendedProduct: z.enum(PRODUCT_LIST).optional().describe("Produk yang direkomendasikan."),
    reason: z.string().optional().describe("Alasan strategis yang kuat dan personal mengapa produk ini harus ditawarkan sekarang."),
    triggeringProduct: z.enum(PRODUCT_LIST).optional().describe("Produk yang sudah dimiliki yang memicu peluang ini."),
});

export async function generateOpportunityForCustomer(customer: Customer): Promise<OpportunityTask | null> {
    const result = await generateOpportunity(customer);

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

async function generateOpportunity(customer: Customer) {
    const customerProducts = customer.products.map(p => `- ${p.name} (Qty: ${p.quantity}, Version: ${p.version || 'N/A'}, Purchase Date: ${p.purchaseDate})`).join('\n');

    const systemPrompt = `Anda adalah seorang Sales Strategist yang sangat berpengalaman. Tugas Anda adalah menganalisis data satu pelanggan untuk menemukan satu peluang cross-sell atau upsell terbaik.

Aturan Analisis & Logika:
1. Cari Peluang: Tinjau produk yang dimiliki pelanggan. Apakah ada produk pelengkap atau versi yang lebih tinggi yang bisa ditawarkan?
   - Aturan Cross-sell 1: Jika pelanggan punya "Sketchup" tapi TIDAK punya produk rendering (D5 Render, V-Ray, Enscape, Corona), ini adalah peluang untuk "D5 Render".
   - Aturan Cross-sell 2: Jika pelanggan punya "ZWCAD" tapi TIDAK punya "ZW3D", ini adalah peluang untuk "ZW3D".
   - Jika tidak ada peluang yang jelas, set "isOpportunity" ke false.
2. Buat Alasan yang Kuat & Personal (Jika ada peluang): JANGAN gunakan alasan generik. Gunakan data pelanggan untuk membuat alasan yang spesifik.
3. Format Output: JSON dengan field "isOpportunity", "recommendedProduct", "reason", dan "triggeringProduct".`;

    const userPrompt = `Data Pelanggan:
- Nama: ${customer.name}
- Jabatan: ${customer.jobTitle}
- Perusahaan: ${customer.company}
- Produk yang Dimiliki:
${customerProducts}
- Bergabung Sejak: ${customer.createdAt}

Analisis peluang cross-sell/upsell untuk pelanggan ini.`;

    try {
        const output = await callOpenAI({
            systemPrompt,
            userPrompt,
            schema: OpportunityGenerationOutputSchema,
            temperature: 0.3,
            maxTokens: 1024,
        });

        return output;
    } catch (error) {
        console.error(`[Flow: generateOpportunity] Gagal untuk pelanggan ${customer.id} (${customer.name}):`, error);
        return { isOpportunity: false };
    }
}
