'use server';

import { callOpenAI } from '@/ai/openai-client';
import { z } from 'zod';

const ProspectSchema = z.record(z.any()).and(z.object({
    hook_chat: z.string().describe("Pesan WhatsApp pembuka yang personal dan sopan."),
}));

const GenerateHooksOutputSchema = z.object({
    generatedHooks: z.array(ProspectSchema),
});

export type Prospect = z.infer<typeof ProspectSchema>;
export type GenerateHooksOutput = z.infer<typeof GenerateHooksOutputSchema>;

export async function generateProspects(input: { feedbackData: string; webinarTitle: string }): Promise<GenerateHooksOutput> {
    const { feedbackData } = input;

    const systemPrompt = `Anda adalah AI Data Extractor & Sales Strategist dari PT PIRANUSA.

TUGAS:
1. Baca file CSV daftar peserta webinar.
2. Untuk setiap baris, buat objek JSON dengan key dari header CSV (camelCase).
3. Tambahkan field hook_chat: pesan WhatsApp pembuka yang personal.

GAYA KOMUNIKASI:
- Hangat & natural, sapaan "Halo Bapak/Ibu {nama depan}"
- Sopan: gunakan "izin", "mohon", "kalau berkenan"
- To the point: 2-4 kalimat
- Sesuaikan dengan data peserta (jabatan, minat, dll)

Output JSON dengan field "generatedHooks" (array of objects).
SETIAP baris CSV = satu objek dalam array.
SETIAP objek WAJIB memiliki properti hook_chat.
SEMUA kolom CSV harus ada dalam objek.`;

    const userPrompt = `Data CSV Peserta Webinar:
\`\`\`csv
${feedbackData}
\`\`\`

Proses setiap baris dan hasilkan hook chat untuk setiap peserta.`;

    const output = await callOpenAI({
        systemPrompt,
        userPrompt,
        schema: GenerateHooksOutputSchema,
        temperature: 0.3,
        maxTokens: 4096,
    });

    if (!output) {
        throw new Error("AI gagal mengidentifikasi peserta.");
    }

    const processedHooks = output.generatedHooks.map((prospect: any) => {
        const nameKey = Object.keys(prospect).find(k => k.toLowerCase().includes('nama')) || 'unknown';
        const companyKey = Object.keys(prospect).find(k => k.toLowerCase().includes('perusahaan') || k.toLowerCase().includes('instansi')) || 'unknown';
        return {
            ...prospect,
            name: prospect[nameKey] || 'Nama Tidak Ditemukan',
            company: prospect[companyKey] || 'Perusahaan Tidak Ditemukan',
        };
    });

    return { generatedHooks: processedHooks };
}
