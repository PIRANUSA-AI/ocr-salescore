/**
 * @fileOverview Extracts structured customer data from a specific form image.
 * This flow is designed to understand checkboxes and handwritten notes on the Piranusa Customer Form.
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import axios from 'axios';

// GLM (Zhipu AI) vision endpoint — OpenAI-compatible. OCR is routed here
// instead of Gemini; all other AI flows still use Google via @/ai/genkit.
const GLM_ENDPOINT =
  process.env.GLM_ENDPOINT ||
  'https://api.z.ai/api/coding/paas/v4/chat/completions';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-4.6v';

/**
 * Extract a JSON object string from GLM's text response.
 * Handles: ```json fences, conversational prose around the JSON
 * (e.g. "Saya melihat form berikut. { ... }"), and plain JSON.
 */
function extractJsonObject(text: string): string {
  let t = text.trim();
  // Pull content out of a markdown code fence if present.
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    t = fence[1].trim();
  }
  // If GLM wrapped the JSON in conversational prose, grab the outermost object.
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return t.slice(first, last + 1);
  }
  return t;
}

// -------- ZOD SCHEMAS --------

const OcrFormInputSchema = z.object({
  imageDataUri: z.string().describe("The Piranusa Customer Form image as a data URI."),
});
export type OcrFormInput = z.infer<typeof OcrFormInputSchema>;

const FormAnswerSchema = z.object({
    question: z.string(),
    answer: z.string(),
});

// This schema mirrors the structure of the form.
const OcrFormResultSchema = z.object({
    name: z.string().describe("The full name of the person from the business card section.").optional(),
    company: z.string().describe("The company name from the business card section.").optional(),
    jobTitle: z.string().describe("The job title from the business card section.").optional(),
    phone: z.string().describe("The phone number from the business card section.").optional(),
    email: z.string().describe("The email address from the business card section.").optional(),
    
    // Flexible form answers
    formAnswers: z.array(FormAnswerSchema).describe("An array of all identified questions and their corresponding answers from the form.").optional(),
});
export type OcrFormResult = z.infer<typeof OcrFormResultSchema>;


// -------- GENKIT FLOW --------

export async function extractCustomerFromForm(input: OcrFormInput): Promise<OcrFormResult> {
  return extractCustomerFromFormFlow(input);
}


const extractCustomerFromFormFlow = ai.defineFlow(
  {
    name: 'extractCustomerFromFormFlow',
    inputSchema: OcrFormInputSchema,
    outputSchema: OcrFormResultSchema,
  },
  async ({ imageDataUri }) => {
    
    const promptText = `
      **PERAN UTAMA:**
      Anda adalah seorang asisten data entry AI yang sangat teliti dan akurat. Tugas Anda adalah menganalisis gambar "FORM CUSTOMER" dari PIRANUSA dan mengekstrak semua informasi yang relevan ke dalam format JSON yang terstruktur dan fleksibel.

      **ATURAN ANALISIS GAMBAR (SANGAT PENTING):**

      1.  **Prioritaskan Kartu Nama:** Jika ada kartu nama yang ditempel di bagian atas, Anda WAJIB menggunakan informasi dari kartu nama tersebut untuk field 'name', 'company', 'jobTitle', 'phone', dan 'email'. Jika tidak ada kartu nama, barulah ekstrak informasi ini dari tulisan tangan di formulir.

      2.  **Ekstraksi Informasi dari FORMULIR (Format Fleksibel):**
          - **Tujuan:** Buat sebuah array bernama "formAnswers".
          - **Cara Kerja:** Untuk setiap baris pertanyaan di formulir, buat satu objek di dalam array \`formAnswers\`. Objek ini harus memiliki dua properti: \`question\` (teks pertanyaan itu sendiri) dan \`answer\` (jawaban yang ditemukan).
          - **ATURAN MEMBACA TANDA YANG SANGAT KETAT (KRUSIAL):**
              - Tanda **centang (✓), silang (X), atau kotak yang diisi** berarti jawaban tersebut **DIPILIH**. Anggap semua tanda tersebut sebagai pilihan yang valid.
              - **JANGAN PERNAH MENYIMPULKAN JAWABAN GANDA KECUALI ADA BEBERAPA TANDA YANG JELAS.** Jika hanya satu kotak yang ditandai untuk satu pertanyaan (misalnya, hanya "CAM" yang ditandai), maka output HARUS hanya "CAM", bukan "CAD, CAM".
              - Jika ada tulisan tangan (seperti pada "Kendala"), transkripsikan tulisan tangan tersebut sebagai \`answer\`.
          - **Item Spesial untuk Dibaca:**
                - **Prioritas Pelanggan:** Di bagian atas kiri, ada pilihan "High, Medium, Low". Anda **WAJIB** mengekstrak ini. Jika salah satu ditandai, masukkan sebagai jawaban. **Jika tidak ada yang ditandai sama sekali, masukkan jawaban sebagai string "none".**
                - **Note Tambahan:** Di bagian bawah, cari kolom "Note Tambahan" dan transkripsikan isi tulisan tangannya. Jika ada isinya, masukkan sebagai pertanyaan "Note Tambahan" dengan jawabannya. Jika kosong, abaikan.
          - **Abaikan Nama Sales:** Jangan ekstraksi nama "Windy" atau nama sales lainnya, karena itu bukan data pelanggan.
          - **Jika Pertanyaan Tidak Dijawab:** Selain "Prioritas Pelanggan", jika pertanyaan lain tidak dijawab (tidak ditandai), jangan masukkan ke dalam array \`formAnswers\`.

      **CONTOH OUTPUT JSON YANG DIHARAPKAN (DENGAN ATURAN KETAT):**
      \`\`\`json
      {
        "name": "Fitriani",
        "company": "PT Piranti Nusantara Teknologi",
        "jobTitle": "Account Manager",
        "phone": "+62 897 8130 772",
        "email": "fitriani@piranusa.com",
        "formAnswers": [
          { "question": "Prioritas Pelanggan", "answer": "High" },
          { "question": "Bergerak dalam industri apa?", "answer": "Mesin & fabrikasi" },
          { "question": "Apa posisi saat ini?", "answer": "Offline Marketing" },
          { "question": "Menggunakan software 2D / 3D?", "answer": "Keduanya" },
          { "question": "Sejauh mana menggunakan software design?", "answer": "CAM" },
          { "question": "Software apa yang digunakan saat ini?", "answer": "CATIA" },
          { "question": "Berapa banyak tim design/pengguna software di perusahaan anda?", "answer": "5-10" },
          { "question": "Pernah dengar tentang ZWSoft sebelumnya?", "answer": "Sedikit tau" },
          { "question": "Apakah bersedia untuk Demo Produk?", "answer": "Ya" },
          { "question": "Apa kendala saat ini dalam proses design", "answer": "harga software yang mahal" },
          { "question": "Note Tambahan", "answer": "Minta dikirimkan penawaran secepatnya." }
        ]
      }
      \`\`\`
      
      **CONTOH KASUS PRIORITAS TIDAK DIPILIH:**
      \`\`\`json
      {
        ...
        "formAnswers": [
          { "question": "Prioritas Pelanggan", "answer": "none" },
          ...
        ]
      }
      \`\`\`

      PERINTAH FINAL: Analisis gambar berikut dengan sangat saksama. Patuhi semua aturan di atas, terutama aturan tentang penandaan kotak dan item spesial. Hasilkan satu objek JSON yang akurat dan jangan membuat asumsi.
    `;

    try {
        console.log("[Flow: extractCustomerFromFormFlow] Calling GLM vision to process form image...");

        const apiKey = process.env.GLM_API_KEY;
        if (!apiKey) {
          throw new Error('GLM_API_KEY belum diset. OCR tidak dapat dijalankan.');
        }

        const requestBody = {
          model: GLM_MODEL,
          temperature: 0.0, // maximum determinism for consistent extraction
          response_format: { type: 'json_object' }, // force JSON output from GLM
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: imageDataUri } },
              ],
            },
          ],
        };
        const requestConfig = {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000,
        };

        // GLM's reasoning model occasionally returns conversational prose
        // instead of JSON. Retry up to 3 times; each attempt also runs a
        // tolerant JSON extractor that strips any surrounding prose.
        const MAX_ATTEMPTS = 3;
        let output: OcrFormResult | undefined;
        let lastError: unknown;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            console.log(`[Flow: extractCustomerFromFormFlow] GLM attempt ${attempt}/${MAX_ATTEMPTS}...`);
            const response = await axios.post(GLM_ENDPOINT, requestBody, requestConfig);

            const rawText: string | undefined =
              response.data?.choices?.[0]?.message?.content;
            if (!rawText) {
              throw new Error("AI failed to extract any information from the form image.");
            }

            const parsed = JSON.parse(extractJsonObject(rawText));
            output = OcrFormResultSchema.parse(parsed);
            break; // success
          } catch (attemptError) {
            lastError = attemptError;
            console.log(`[Flow] Attempt ${attempt} failed: ${attemptError instanceof Error ? attemptError.message.slice(0, 120) : 'unknown'}`);
          }
        }

        if (!output) {
          throw lastError ?? new Error('OCR tidak mengembalikan JSON yang valid setelah beberapa percobaan.');
        }

        console.log("[Flow: extractCustomerFromFormFlow] SUCCESS. GLM form processing complete.");
        return output;

    } catch (error) {
        // GLM/axios buries the real cause (quota, rate-limit, bad key) in the
        // HTTP response body, not error.message — surface it.
        let errorMessage = error instanceof Error ? error.message : 'Unknown error during AI processing.';
        if (axios.isAxiosError(error) && error.response?.data) {
            const body = error.response.data;
            errorMessage =
              body?.error?.message || (typeof body === 'string' ? body : JSON.stringify(body));
        }
        console.error(`[Flow: extractCustomerFromFormFlow] FAILED:`, errorMessage);

        // Check for quota / rate-limit error and provide a user-friendly message
        const lower = errorMessage.toLowerCase();
        if (lower.includes('quota') || lower.includes('rate limit') || lower.includes('1302') || lower.includes('1113')) {
            throw new Error('Gagal mengekstrak data: Batas penggunaan AI (quota) telah tercapai. Silakan coba lagi nanti atau tingkatkan paket Anda.');
        }

        // Throw a more specific error to be caught by the client
        throw new Error(`Gagal mengekstrak data dari gambar formulir. Penyebab: ${errorMessage}`);
    }
  }
);
