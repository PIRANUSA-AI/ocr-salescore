/**
 * @fileOverview This flow analyzes a list of participants, identifies high-potential
 * prospects, and generates personalized outreach hooks for them.
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// -------- ZOD SCHEMAS --------

// The schema is now a dynamic record to capture all columns from the CSV
const ProspectSchema = z.record(z.any()).and(z.object({
    hook_chat: z.string().describe("Pesan WhatsApp pembuka yang personal dan sopan, dibuat berdasarkan data peserta."),
}));

const GenerateHooksOutputSchema = z.object({
    generatedHooks: z.array(ProspectSchema)
});

export type Prospect = z.infer<typeof ProspectSchema>;
export type GenerateHooksOutput = z.infer<typeof GenerateHooksOutputSchema>;


// -------- GENKIT PROMPT --------

const generateHooksPrompt = ai.definePrompt({
   name: 'generateHooksPrompt',
   input: { schema: z.object({ feedbackData: z.string(), webinarTitle: z.string() }) },
   output: { schema: GenerateHooksOutputSchema },
   prompt: `**PERAN UTAMA:**
Anda adalah *AI Data Extractor & Sales Strategist* dari PT PIRANUSA.
Tugas Anda adalah **menganalisis data peserta webinar dari file CSV** dan mengubah setiap baris menjadi objek JSON. Untuk setiap peserta, Anda juga harus **membuat satu pesan pembuka (hook chat)** WhatsApp yang personal.

---

### 🧩 **KONTEKS PEKERJAAN & ATURAN EKSTRAKSI (SANGAT PENTING)**
File CSV berisi daftar peserta webinar. Nama kolom (header) bisa berbeda-beda antar file. Tugas Anda adalah:

1.  **Baca Semua Kolom:** Identifikasi semua kolom yang ada di header CSV.
2.  **Konversi Baris ke JSON:** Untuk setiap baris data peserta, buat satu objek JSON. Gunakan nama header kolom sebagai *key* dan data di sel tersebut sebagai *value*.
3.  **Normalisasi Key:** Ubah nama header menjadi format \`camelCase\` untuk konsistensi (contoh: "Nama Lengkap" menjadi "namaLengkap", "No. Whatsapp" menjadi "noWhatsapp").
4.  **Buat Hook Chat:** Berdasarkan data dari baris tersebut, buat satu field tambahan bernama \`hook_chat\`. Ini harus berupa pesan WhatsApp pembuka yang hangat, personal, dan sopan. Gunakan nama peserta jika tersedia.

---

### 💬 **GAYA KOMUNIKASI PIRANUSA (UNTUK HOOK_CHAT)**
- **Hangat & Natural**: Gunakan sapaan “Halo Bapak/Ibu {nama depan}”. Hindari sapaan waktu (pagi/siang).
- **Sopan**: Gunakan kata "izin", "mohon", "kalau berkenan".
- **To The Point**: 2-4 kalimat pendek.
- **Adaptif**: Sesuaikan pesan berdasarkan data yang ada (jabatan, minat software, dll.).
- **Contoh Baik**: "Halo Pak Budi, terima kasih sudah ikut webinar ZWCAD kemarin. Saya izin bantu follow-up terkait minat Bapak pada ZWCAD. Mungkin ada waktu luang untuk diskusi singkat minggu ini?"

---

### 📦 **FORMAT OUTPUT (WAJIB JSON VALID)**
Hasil akhir HARUS berupa satu objek JSON valid. Jangan tambahkan teks atau komentar di luar blok JSON.

\`\`\`json
{
  "generatedHooks": [
    {
      "timestamp": "10/30/2024 14:00:00",
      "namaLengkap": "Budi Santoso",
      "namaPerusahaan": "PT Konstruksi Hebat",
      "jabatan": "Project Manager",
      "email": "budi.s@konstruksihebat.com",
      "noWhatsapp": "081234567890",
      "minatSoftware": "ZWCAD",
      "saranUntukWebinar": "Materinya sangat bagus dan bermanfaat.",
      "hook_chat": "Halo Pak Budi, terima kasih sudah ikut webinar ZWCAD kemarin. Saya izin bantu follow-up terkait minat Bapak pada ZWCAD. Mungkin ada waktu luang untuk diskusi singkat minggu ini?"
    }
  ]
}
\`\`\`

⚠️ **ATURAN SANGAT PENTING**
- Output HARUS JSON saja.
- Setiap baris dari CSV harus menjadi satu objek dalam array \`generatedHooks\`.
- Setiap objek HARUS memiliki properti \`hook_chat\`.
- Semua kolom lain dari CSV harus ada di dalam objek dengan nama header sebagai *key* (dalam format camelCase).

**Data CSV Peserta:**
\`\`\`csv
{{{feedbackData}}}
\`\`\`
  `,
  });


// -------- GENKIT FLOW --------

const generateHooksFlow = ai.defineFlow(
  {
    name: 'generateHooksFlow',
    inputSchema: z.object({ feedbackData: z.string(), webinarTitle: z.string() }),
    outputSchema: GenerateHooksOutputSchema,
  },
  async (input) => {
    const { output } = await generateHooksPrompt(input);
    if (!output) {
      throw new Error("AI gagal mengidentifikasi peserta. Periksa kembali format data CSV Anda, pastikan memiliki header yang jelas.");
    }
    
    // Additional processing to ensure 'name' and 'company' fields exist for compatibility
    // We try to find the most likely candidates for name and company.
    const processedHooks = output.generatedHooks.map(prospect => {
      const p = prospect as any;
      const nameKey = Object.keys(p).find(k => k.toLowerCase().includes('nama')) || 'unknown';
      const companyKey = Object.keys(p).find(k => k.toLowerCase().includes('perusahaan') || k.toLowerCase().includes('instansi')) || 'unknown';

      return {
        ...p,
        name: p[nameKey] || 'Nama Tidak Ditemukan',
        company: p[companyKey] || 'Perusahaan Tidak Ditemukan',
      };
    });

    return { generatedHooks: processedHooks };
  }
);

// -------- EXPORTED ASYNC FUNCTION --------
export async function generateProspects(input: { feedbackData: string, webinarTitle: string }): Promise<GenerateHooksOutput> {
    return generateHooksFlow(input);
}
