'use server';

import { callOpenAI } from '@/ai/openai-client';
import { z } from 'zod';

const AnalyzeWebinarInputSchema = z.object({
  feedbackData: z.string().describe("Raw CSV data string of participant feedback."),
});
export type AnalyzeWebinarInput = z.infer<typeof AnalyzeWebinarInputSchema>;

const WebinarAnalysisSchema = z.object({
  rating: z.string().describe("Rating keseluruhan dalam format bintang dan angka, contoh: ★★★★☆ (4.4/5)"),
  ringkasan: z.string().describe("Satu paragraf ±100 kata, kepuasan umum, kesan peserta, insight kunci."),
  poin_positif: z.string().describe("Daftar poin positif, dipisahkan oleh \\n."),
  area_peningkatan: z.string().describe("Daftar area peningkatan, dipisahkan oleh \\n."),
});

const AnalyzeWebinarOutputSchema = WebinarAnalysisSchema.extend({
    participantCount: z.number().describe("Jumlah total peserta yang memberikan feedback."),
});
export type WebinarAnalysisOutput = z.infer<typeof AnalyzeWebinarOutputSchema>;

export async function analyzeWebinarFeedback(input: AnalyzeWebinarInput): Promise<WebinarAnalysisOutput> {
    const { feedbackData } = input;

    const rows = feedbackData.trim().split('\n');
    const participantCount = rows.length > 1 ? rows.length - 1 : 0;

    if (participantCount === 0) {
        return {
            participantCount: 0,
            rating: "N/A",
            ringkasan: "Tidak ada data peserta untuk dianalisis.",
            poin_positif: "Tidak ada data.",
            area_peningkatan: "Tidak ada data.",
        };
    }

    const systemPrompt = `Anda adalah AI Webinar Analyst profesional yang bertugas menganalisis hasil survei peserta webinar dari file CSV.

Tugas: Evaluasi performa webinar berdasarkan kolom Rating dan Feedback.
Output: JSON dengan field:
- rating: format bintang dan angka (contoh: ★★★★☆ (4.4/5))
- ringkasan: satu paragraf natural ±100 kata
- poin_positif: daftar dipisahkan \\n
- area_peningkatan: daftar dipisahkan \\n

Gaya: Bahasa Indonesia profesional, to the point, informatif.
Aturan: rating wajib simbol bintang + angka. ringkasan wajib paragraf (bukan list). poin_positif dan area_peningkatan tidak boleh kosong.`;

    const userPrompt = `Berikut adalah data CSV feedback peserta webinar:

\`\`\`csv
${feedbackData}
\`\`\`

Analisis data tersebut dan hasilkan JSON sesuai format yang diminta.`;

    const output = await callOpenAI({
        systemPrompt,
        userPrompt,
        schema: WebinarAnalysisSchema,
        temperature: 0.3,
        maxTokens: 1024,
    });

    if (!output) {
        throw new Error("Analisis AI gagal menghasilkan respons.");
    }

    return {
        ...output,
        participantCount,
    };
}
