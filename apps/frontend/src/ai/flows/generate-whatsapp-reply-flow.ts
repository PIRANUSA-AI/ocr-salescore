'use server';

import { callOpenAI, callOpenAIText } from '@/ai/openai-client';
import { z } from 'zod';

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

function buildTextPrompt(p: {
  chatHistory: string;
  customerName?: string;
  customerCompany?: string;
  jabatan?: string;
  contextHint?: string;
}) {
  return `**PERAN UTAMA:**
Anda adalah AI Sales Assistant internal PT PIRANUSA. Tugas Anda adalah menganalisis percakapan pelanggan dan menghasilkan TEPAT DUA rekomendasi balasan WhatsApp yang berbeda.

### GAYA KOMUNIKASI
1. Opsi 1 (Profesional & Cepat): Gunakan gaya yang to-the-point, sopan, dan berfokus pada solusi.
2. Opsi 2 (Hangat & Relasional): Gunakan gaya yang lebih ramah, empatik, dan bertujuan membangun hubungan baik. Boleh gunakan emoji ringan (🙏🙂✨).

### FORMAT OUTPUT (HANYA JSON MURNI):
{
  "conversationContext": "Ringkasan singkat konteks percakapan.",
  "recommendations": [
    "Opsi balasan pertama (gaya profesional).",
    "Opsi balasan kedua (gaya hangat/relasional)."
  ]
}
Pastikan array recommendations berisi TEPAT DUA string.

**Input Teks:**
${p.chatHistory || '(Tidak ada riwayat percakapan terdeteksi)'}

**Data Tambahan:**
- Nama Pelanggan: ${p.customerName || '-'}
- Perusahaan: ${p.customerCompany || '-'}
- Jabatan: ${p.jabatan || '-'}
- Konteks: ${p.contextHint || '-'}`;
}

export async function generateWhatsappReply(
  input: GenerateWhatsappReplyInput
): Promise<GenerateWhatsappReplyOutput> {
  console.log('[Flow] Input:', { ...input, image: input.image ? '[base64]' : undefined });

  let chatHistoryText = (input.chatHistory || '').trim();

  if (input.image) {
    console.log('[Flow] Mode: IMAGE → OCR via OpenAI');
    try {
      const text = await callOpenAIText({
        systemPrompt: 'Anda adalah asisten OCR. Transkripsikan semua teks dari gambar screenshot percakapan ini. Kembalikan HANYA teks mentah dari percakapan tersebut.',
        userPrompt: 'Transkripsikan teks dari gambar screenshot chat WhatsApp ini.',
        imageDataUri: input.image,
        temperature: 0,
        maxTokens: 2048,
      });

      if (!text || !text.trim()) throw new Error('OCR tidak mengembalikan teks.');
      chatHistoryText = text.trim();
      console.log('[Flow] OCR sukses via OpenAI.');
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

  const systemPrompt = `Anda adalah AI Sales Assistant internal PT PIRANUSA. Tugas Anda adalah menganalisis percakapan pelanggan dan menghasilkan TEPAT DUA rekomendasi balasan WhatsApp yang berbeda.

GAYA KOMUNIKASI:
1. Opsi 1 (Profesional & Cepat): to-the-point, sopan, fokus solusi.
2. Opsi 2 (Hangat & Relasional): ramah, empatik, membangun hubungan. Boleh emoji ringan.

Output JSON dengan field "conversationContext" (string) dan "recommendations" (array of 2 strings).`;

  const userPrompt = buildTextPrompt({
    chatHistory: chatHistoryText,
    customerName: input.customerName,
    customerCompany: input.customerCompany,
    jabatan: input.jabatan,
    contextHint: input.contextHint,
  });

  const output = await callOpenAI({
    systemPrompt,
    userPrompt,
    schema: GenerateWhatsappReplyOutputSchema,
    temperature: 0.3,
    maxTokens: 1024,
  });

  if (!output) throw new Error('AI tidak mengembalikan output.');

  if (!output.recommendations?.length) {
    output.recommendations = [
      `Halo Bapak/Ibu ${input.customerName ?? ''}, terima kasih informasinya. Izin kami bantu tindak lanjut. Apakah berkenan jika kami kirimkan materi atau link trial terlebih dahulu? 🙏`.trim(),
      `Baik, Bapak/Ibu ${input.customerName ?? ''}. Terima kasih atas konfirmasinya. Saya akan segera koordinasikan lebih lanjut ya.`,
    ];
  }

  return output;
}
