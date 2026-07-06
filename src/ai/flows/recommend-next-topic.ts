'use server';

import { callOpenAI } from '@/ai/openai-client';
import { z } from 'zod';

const RecommendTopicInputSchema = z.object({
  pollData: z.string().describe("Raw CSV data string containing feedback and topic polls."),
  webinarTitle: z.string().describe("The title of the last webinar, for context."),
});

export type RecommendTopicInput = z.infer<typeof RecommendTopicInputSchema>;

const TopicRecommendationSchema = z.object({
    topic: z.string().describe("Judul yang direkomendasikan untuk topik webinar selanjutnya."),
    rationale: z.string().describe("Penjelasan singkat mengapa topik ini strategis."),
    source: z.string().describe("Sumber utama inspirasi topik (misal: 'Feedback Peserta' atau 'Tren Web')."),
});

const TopicRecommendationsOutputSchema = z.object({
    recommendations: z.array(TopicRecommendationSchema),
});

export type TopicRecommendation = z.infer<typeof TopicRecommendationsOutputSchema>;

export async function recommendNextTopic(input: RecommendTopicInput): Promise<TopicRecommendation> {
    const { pollData, webinarTitle } = input;

    const systemPrompt = `Anda adalah AI Content Strategist untuk PT PIRANUSA, distributor software CAD (ZWCAD, ZW3D, Archicad, Enscape, D5 Render).

TUGAS:
1. Baca data polling feedback peserta.
2. Gabungkan dengan pengetahuan tren industri arsitektur, manufaktur, dan desain di Indonesia.
3. Hasilkan 5 rekomendasi topik webinar.
4. Verifikasi nama software ditulis dengan benar.

Output JSON dengan field "recommendations" (array of {topic, rationale, source}).`;

    const userPrompt = `Informasi Kontekstual:
- Judul Webinar Terakhir: ${webinarTitle}

Data Polling Topik CSV:
\`\`\`csv
${pollData}
\`\`\`

Berdasarkan data di atas dan tren industri saat ini, berikan 5 rekomendasi topik webinar untuk PT PIRANUSA.`;

    const output = await callOpenAI({
        systemPrompt,
        userPrompt,
        schema: TopicRecommendationsOutputSchema,
        temperature: 0.4,
        maxTokens: 1024,
    });

    if (!output) {
        throw new Error("AI gagal memberikan rekomendasi topik.");
    }

    return output;
}
