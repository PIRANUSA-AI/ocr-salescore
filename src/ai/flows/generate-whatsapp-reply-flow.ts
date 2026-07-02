/**
 * @fileOverview Flow Genkit: Rekomendasi balasan WhatsApp (TEXT atau IMAGE/OCR).
 * - Jika image diisi: OCR -> hasil OCR jadi chatHistory.
 * - Jika hanya teks: langsung generate rekomendasi.
 * - Output JSON dipaksa & tervalidasi via Zod + Genkit (tanpa regex parsing).
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// ====================== SCHEMAS ======================

const GenerateWhatsappReplyInputSchema = z.object({
  chatHistory: z.string().optional().describe('Teks riwayat percakapan.'),
  image: z.string().optional().describe('Screenshot chat (base64 ATAU data URL).'),
  customerName: z.string().describe('Nama pelanggan.'),
  telepon: z.string().optional(),
  jabatan: z.string().optional(),
  customerCompany: z.string().optional(),
  email: z.string().optional(),
  lastContactedAt: z.string().optional(),
  contextHint: z.string().optional(),
});
export type GenerateWhatsappReplyInput = z.infer<typeof GenerateWhatsappReplyInputSchema>;

const GenerateWhatsappReplyOutputSchema = z.object({
  conversationContext: z.string().describe('Ringkasan singkat konteks percakapan.'),
  recommendations: z.array(z.string()).describe('Tepat dua opsi balasan WhatsApp siap kirim.'),
});
export type GenerateWhatsappReplyOutput = z.infer<typeof GenerateWhatsappReplyOutputSchema>;

// ====================== HELPERS ======================

/** Ekstrak { mimeType, data } dari data URL/base64 mentah. */
function toInlineDataFromMaybeDataUrl(src: string) {
  let mimeType = 'image/png';
  let data = src;
  const m = /^data:(.*?);base64,(.*)$/.exec(src);
  if (m) {
    mimeType = m[1] || mimeType;
    data = m[2];
  }
  return { mimeType, data };
}

/** Bangun prompt final (instruksi + input user) — hanya JSON diharapkan. */
function buildTextPrompt(p: {
  chatHistory: string;
  customerName?: string;
  customerCompany?: string;
  jabatan?: string;
  contextHint?: string;
}) {
  return `**PERAN UTAMA:**
Anda adalah *AI Sales Assistant* internal PT PIRANUSA. Tugas Anda adalah menganalisis percakapan pelanggan dan menghasilkan **TEPAT DUA** rekomendasi balasan WhatsApp yang berbeda.

### GAYA KOMUNIKASI
1.  **Opsi 1 (Profesional & Cepat):** Gunakan gaya yang to-the-point, sopan, dan berfokus pada solusi.
2.  **Opsi 2 (Hangat & Relasional):** Gunakan gaya yang lebih ramah, empatik, dan bertujuan membangun hubungan baik. Boleh gunakan emoji ringan (🙏🙂✨).

### FORMAT OUTPUT (HANYA JSON MURNI):
{
  "conversationContext": "Ringkasan singkat konteks percakapan.",
  "recommendations": [
    "Tulis opsi balasan pertama di sini (gaya profesional).",
    "Tulis opsi balasan kedua di sini (gaya hangat/relasional)."
  ]
}
JANGAN kirim teks lain selain JSON murni. Pastikan array 'recommendations' berisi TEPAT DUA string.

**Input Teks:**
${p.chatHistory || '(Tidak ada riwayat percakapan terdeteksi)'}

**Data Tambahan:**
- Nama Pelanggan: ${p.customerName || '-'}
- Perusahaan: ${p.customerCompany || '-'}
- Jabatan: ${p.jabatan || '-'}
- Konteks: ${p.contextHint || '-'}
`;
}

// ====================== PUBLIC API ======================

export async function generateWhatsappReply(
  input: GenerateWhatsappReplyInput
): Promise<GenerateWhatsappReplyOutput> {
  return generateWhatsappReplyFlow(input);
}

// ====================== MAIN FLOW ======================

export const generateWhatsappReplyFlow = ai.defineFlow(
  {
    name: 'generateWhatsappReplyFlow',
    inputSchema: GenerateWhatsappReplyInputSchema,
    outputSchema: GenerateWhatsappReplyOutputSchema,
  },
  async (input) => {
    console.log('[Flow] Input:', { ...input, image: input.image ? '[base64]' : undefined });

    // 0) Tentukan sumber teks (prioritas: image->OCR; else chatHistory)
    let chatHistoryText = (input.chatHistory || '').trim();

    if (input.image) {
      console.log('[Flow] Mode: IMAGE → OCR');
      try {
        const { text } = await ai.generate({
          model: 'googleai/gemini-2.5-flash',
          prompt: [
            { text: "Anda adalah asisten OCR. Transkripsikan semua teks dari gambar screenshot percakapan ini. Kembalikan HANYA teks mentah dari percakapan tersebut." },
            { media: { url: input.image } }
          ],
          config: { temperature: 0.0 }
        });

        if (!text || !text.trim()) throw new Error('OCR tidak mengembalikan teks.');
        chatHistoryText = text.trim();
        console.log('[Flow] OCR sukses.');
      } catch (e) {
        console.error('[Flow] OCR gagal:', e);
        throw new Error('Gagal memproses gambar screenshot chat.');
      }
    } else {
      console.log('[Flow] Mode: TEXT ONLY');
    }

    if (!chatHistoryText) {
      chatHistoryText = '(Tidak ada riwayat percakapan terdeteksi)';
    }

    // 1) Susun prompt final
    const renderedTextPrompt = (buildTextPrompt({
      chatHistory: chatHistoryText,
      customerName: input.customerName,
      customerCompany: input.customerCompany,
      jabatan: input.jabatan,
      contextHint: input.contextHint,
    }) || '').trim();

    if (!renderedTextPrompt) {
      throw new Error('Prompt kosong setelah build.');
    }

    // 2) Generate → kirim sebagai parts array, paksa JSON, auto-parse Zod
    const genParts = [{ text: renderedTextPrompt }];

    const { output } = await ai.generate({
      model: 'googleai/gemini-2.5-flash',
      prompt: genParts,
      output: { schema: GenerateWhatsappReplyOutputSchema },
      config: {
        temperature: 0.3,
        responseMimeType: 'application/json',
      },
    });

    if (!output) throw new Error('AI tidak mengembalikan output.');

    // 3) Fallback kalau rekomendasi kosong
    if (!output.recommendations?.length) {
      output.recommendations = [
        `Halo Bapak/Ibu ${input.customerName ?? ''}, terima kasih informasinya. Izin kami bantu tindak lanjut. Apakah berkenan jika kami kirimkan materi atau link trial terlebih dahulu? 🙏`.trim(),
        `Baik, Bapak/Ibu ${input.customerName ?? ''}. Terima kasih atas konfirmasinya. Saya akan segera koordinasikan lebih lanjut ya.`,
      ];
    }

    return output;
  }
);
