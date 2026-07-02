/**
 * @fileOverview This flow analyzes polling data from a Google Sheet and performs
 * external web research to recommend a strategic topic for the next webinar.
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// -------- ZOD SCHEMAS --------

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

// -------- GENKIT PROMPT --------

const recommendTopicPrompt = ai.definePrompt({
   name: 'recommendTopicPrompt',
   model: 'googleai/gemini-2.5-flash',
   input: { schema: RecommendTopicInputSchema },
   output: { schema: TopicRecommendationsOutputSchema },
   prompt: `**PERAN UTAMA:**
Anda adalah *AI Content Strategist* untuk PT PIRANUSA, distributor software CAD (ZWCAD, ZW3D, Archicad, Enscape, D5 Render). 

**TUJUAN:**
Menganalisis data feedback peserta (terutama kolom 'Saran Topik Berikutnya' atau 'Feedback') DAN melakukan pencarian Google untuk menemukan tren topik yang sedang *hype* di industri arsitektur, manufaktur, dan desain di Indonesia.

**TUGAS:**
1.  Baca data JSON feedback peserta.
2.  Lakukan Google Search untuk topik seperti 'tren software CAD 2025', 'webinar arsitektur populer Indonesia', 'topik ZWCAD terbaru', 'masalah umum desainer manufaktur'.
3.  Gabungkan kedua sumber tersebut untuk menghasilkan **5 rekomendasi topik webinar**.
4.  **Verifikasi Nama Software:** Pastikan nama software (ZWCAD, ZW3D, Archicad, Enscape, D5 Render) ditulis dengan benar jika muncul.
5.  Hasil akhir HARUS berupa **satu objek JSON valid** dengan struktur di bawah.

**FORMAT OUTPUT (WAJIB JSON):**
\`\`\`json
{
  "recommendations": [
    {
      "topic": "Judul Webinar yang Menarik dan Jelas",
      "rationale": "Penjelasan singkat mengapa topik ini relevan (misal: 'Banyak peserta meminta topik X' atau 'Topik Y sedang tren di Google').",
      "source": "Feedback Peserta" 
    },
    {
      "topic": "Eksplorasi Fitur AI di ZWCAD 2026 untuk Arsitek",
      "rationale": "Pencarian Google menunjukkan peningkatan minat pada 'AI di CAD' dan ini sejalan dengan rilis produk baru.",
      "source": "Tren Web"
    }
  ]
}
\`\`\`

**PERINTAH FINAL:**
Keluaran Anda HARUS hanya berisi satu blok JSON valid. Jangan tambahkan teks lain di luar blok JSON.

  **Informasi Kontekstual:**
  -   Judul Webinar Terakhir: {{{webinarTitle}}}

  **Data Polling Topik CSV (format bisa bervariasi):**
  \`\`\`csv
  {{{pollData}}}
  \`\`\`
  `,
  });

// -------- GENKIT FLOW --------

const recommendNextTopicFlow = ai.defineFlow(
  {
    name: 'recommendNextTopicFlow',
    inputSchema: RecommendTopicInputSchema,
    outputSchema: TopicRecommendationsOutputSchema,
  },
  async (input) => {
    const { output } = await recommendTopicPrompt(input);

    if (!output) {
      throw new Error("AI gagal memberikan rekomendasi topik. Pastikan ada usulan topik di data Anda.");
    }

    return output;
  }
);


export async function recommendNextTopic(input: RecommendTopicInput): Promise<TopicRecommendation> {
    return recommendNextTopicFlow(input);
}
