/**
 * @fileOverview This flow analyzes raw webinar feedback from a Google Sheet,
 * extracting quantitative and qualitative insights using AI.
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// -------- ZOD SCHEMAS --------

const AnalyzeWebinarInputSchema = z.object({
  feedbackData: z.string().describe("Raw CSV data string of participant feedback."),
});
export type AnalyzeWebinarInput = z.infer<typeof AnalyzeWebinarInputSchema>;


const WebinarAnalysisSchema = z.object({
  rating: z.string().describe("Rating keseluruhan dalam format bintang dan angka, contoh: ★★★★☆ (4.4/5)"),
  ringkasan: z.string().describe("Satu paragraf berisi sekitar 100 kata, menjelaskan tingkat kepuasan umum, kesan peserta, serta insight kunci dari seluruh data peserta."),
  poin_positif: z.string().describe("Daftar poin positif, dipisahkan oleh \\n."),
  area_peningkatan: z.string().describe("Daftar area peningkatan, dipisahkan oleh \\n."),
});
export type WebinarAnalysis = z.infer<typeof WebinarAnalysisSchema>;

// We add participantCount to the output of the flow itself.
const AnalyzeWebinarOutputSchema = WebinarAnalysisSchema.extend({
    participantCount: z.number().describe("Jumlah total peserta yang memberikan feedback, dihitung dari data mentah."),
});
export type WebinarAnalysisOutput = z.infer<typeof AnalyzeWebinarOutputSchema>;


// -------- GENKIT PROMPT --------

const analyzeFeedbackPrompt = ai.definePrompt({
   name: 'analyzeFeedbackPrompt',
   input: { schema: AnalyzeWebinarInputSchema },
   output: { schema: WebinarAnalysisSchema }, // AI only outputs the analysis, not the count
   prompt: `**CONTEXT:**
Anda adalah *AI Webinar Analyst* profesional yang bertugas menganalisis hasil survei peserta webinar dari file CSV.  
CSV berisi kolom seperti: 'Nama Peserta', 'Rating', dan 'Feedback'.  
Tugas Anda adalah menyimpulkan hasil webinar secara objektif, padat, dan mudah dipahami oleh pembaca manusia.

---

### 🎯 **OBJECTIVE**
Evaluasi performa webinar berdasarkan kolom **Rating** dan **Feedback**, kemudian hasilkan:
1. **Rating keseluruhan** (dalam format bintang dan angka, contoh: ★★★★☆ (4.4/5)).
2. **Ringkasan profesional (±100 kata)** berisi insight utama dari seluruh data peserta.
3. **Poin Positif**, berupa daftar singkat hal-hal yang diapresiasi peserta.
4. **Area Peningkatan**, berupa daftar singkat hal-hal yang perlu diperbaiki.

Output akhir **wajib berupa satu objek JSON valid** yang sudah siap digunakan dalam tampilan visual (dashboard atau laporan ringkas).

---

### 🧠 **STYLE & TONE**
- Gunakan bahasa Indonesia yang profesional namun tetap mudah dibaca.
- Gunakan kalimat *to the point* dan informatif, hindari jargon akademis.
- Format hasil agar **nyaman dibaca manusia**, bukan sekadar data mentah.
- Hindari penulisan seperti “[Catatan AI:]”, “[Revisi:]”, atau teks meta lainnya.
- Gunakan tanda bintang (*) untuk membuat poin list di JSON agar nanti mudah diformat sebagai bullet list di tampilan UI.

---

### ⚙️ **FORMAT OUTPUT (HARUS DIPATUHI 100%)**
Output Anda HARUS berupa satu objek JSON valid dengan struktur berikut:

\`\`\`json
{
  "rating": "★★★★☆ (4.4/5)",
  "ringkasan": "Tulis satu paragraf berisi sekitar 100 kata, menjelaskan tingkat kepuasan umum, kesan peserta, serta insight kunci dari feedback. Hindari pengulangan dan jaga alur agar natural.",
  "poin_positif": "* Tulis minimal satu poin positif berdasarkan feedback peserta.\\n* Jika banyak feedback positif umum, simpulkan dalam bentuk kalimat yang ringkas.",
  "area_peningkatan": "* Tulis minimal satu poin area peningkatan berdasarkan feedback peserta.\\n* Jika tidak ada feedback negatif atau saran spesifik, gunakan fallback: 'Tidak ada feedback spesifik yang diberikan oleh peserta.'"
}
\`\`\`

📏 ATURAN SANGAT KETAT
rating harus mencakup simbol bintang (★) dan nilai angka (misal: “★★★★☆ (4.3/5)”).
ringkasan wajib satu paragraf natural ±100 kata (bukan list).
poin_positif dan area_peningkatan tidak boleh kosong.
Jika tidak ada masukan spesifik, isi dengan fallback yang relevan.
Semua karakter spesial di JSON seperti tanda kutip (\\"), garis baru (\\\\n), dan backslash (\\\\) harus di-escape dengan benar.
JANGAN menulis teks di luar blok JSON {...} (tidak ada pembuka/pengantar).

💡 CONTOH OUTPUT YANG BENAR:

{
  "rating": "★★★★☆ (4.4/5)",
  "ringkasan": "Tingkat kepuasan peserta terhadap webinar ini sangat tinggi, dengan mayoritas responden menyatakan puas atau sangat puas. Peserta menilai materi yang disampaikan menarik, informatif, dan relevan dengan kebutuhan industri. Beberapa peserta mengapresiasi kejelasan narasumber serta contoh penerapan software yang praktis. Meski demikian, ada saran agar sesi tanya jawab diperpanjng dan jadwal webinar dibuat lebih interaktif. Secara keseluruhan, webinar ini berhasil memperkuat minat peserta terhadap ZWCAD dan mendorong mereka untuk melanjutkan eksplorasi produk secara mandiri.",
  "poin_positif": "* Materi webinar dinilai menarik dan aplikatif.\\n* Pembicara dianggap kompeten dan mudah dipahami.\\n* Format acara interaktif dan informatif.",
  "area_peningkatan": "* Durasi sesi tanya jawab masih terasa singkat.\\n* Beberapa peserta menyarankan contoh studi kasus tambahan."
} 

✅ CATATAN PENTING UNTUK AI
Fokus pada kesimpulan, bukan pengulangan data mentah.
Jika jumlah data kecil, tetap tulis analisis ringkas (gunakan kata “Sebagian besar” atau “Mayoritas peserta…”).
Gunakan ejaan baku bahasa Indonesia.
Hindari menulis nilai numerik tanpa konteks (contoh: “4.5” → ubah jadi “★★★★½ (4.5/5)”).
Output akhir harus bisa langsung di-parse oleh sistem dan dibaca user tanpa perlu edit manual.

PERINTAH FINAL:

Keluaran Anda HARUS hanya berisi satu blok JSON valid dan lengkap seperti struktur di atas. Jangan tambahkan komentar, catatan, atau teks lain di luar kurung kurawal JSON.

  **Data CSV (Struktur Tetap):**
  \`\`\`csv
  {{{feedbackData}}}
  \`\`\`
  `,
  });


// -------- GENKIT FLOW (DEFINED FIRST) --------

const analyzeWebinarFeedbackFlow = ai.defineFlow(
  {
    name: 'analyzeWebinarFeedbackFlow',
    inputSchema: AnalyzeWebinarInputSchema,
    outputSchema: AnalyzeWebinarOutputSchema,
  },
  async ({ feedbackData }) => {
    
    // Count participants reliably in code
    const rows = feedbackData.trim().split('\n');
    const participantCount = rows.length > 1 ? rows.length - 1 : 0; // Subtract 1 for the header row

    // If there are no participants, return a default structure without calling AI
    if (participantCount === 0) {
      return {
        participantCount: 0,
        rating: "N/A",
        ringkasan: "Tidak ada data peserta untuk dianalisis.",
        poin_positif: "Tidak ada data.",
        area_peningkatan: "Tidak ada data.",
      };
    }
    
    // Only call AI for qualitative analysis if there are participants
    const { output: analysisResult } = await analyzeFeedbackPrompt({ feedbackData });

    if (!analysisResult) {
      throw new Error("Analisis AI gagal menghasilkan respons. Periksa kembali format data CSV Anda.");
    }
    
    // Combine reliable participant count with AI analysis result
    return {
      ...analysisResult,
      participantCount: participantCount, // Override any AI count with our reliable one
    };
  }
);


// -------- EXPORTED FUNCTION (DEFINED LAST) --------

export async function analyzeWebinarFeedback(input: AnalyzeWebinarInput): Promise<WebinarAnalysisOutput> {
  return analyzeWebinarFeedbackFlow(input);
}
