'use server';

import { callOpenAIText } from '@/ai/openai-client';
import { getCustomerById } from './customer';

export interface LeadActionAI {
    action: string;
    reason: string;
    message: string;
}

// Ambil objek JSON dari teks (tahan terhadap markdown fence / teks tambahan)
function extractJson(raw: string): any {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
        text = text.slice(start, end + 1);
    }
    return JSON.parse(text);
}

// Normalisasi: unwrap nested + map key alternatif (id/en)
function normalize(obj: any): LeadActionAI {
    let o = obj;
    if (o && typeof o === 'object' && !o.action) {
        const keys = Object.keys(o);
        if (keys.length === 1 && typeof o[keys[0]] === 'object') {
            o = o[keys[0]]; // unwrap { recommendation: {...} } dst
        }
    }
    const action = o?.action || o?.aksi || o?.saran || o?.recommendation;
    const reason = o?.reason || o?.alasan || o?.alasannya;
    const message = o?.message || o?.pesan || o?.draft || o?.whatsapp || o?.wa;
    if (!action || !reason || !message) {
        throw new Error('Format AI tidak valid: ' + JSON.stringify(o).slice(0, 200));
    }
    return { action: String(action).trim(), reason: String(reason).trim(), message: String(message).trim() };
}

/**
 * AI rekomendasi aksi untuk satu lead (lazy, on-demand).
 */
export async function generateLeadActionAI(customerId: string): Promise<LeadActionAI> {
    console.log(`[Action: generateLeadActionAI] for ${customerId}`);
    const c = await getCustomerById(customerId);
    if (!c) throw new Error('Pelanggan tidak ditemukan.');

    const lastActivity = c.notes?.manual ? c.notes.manual.slice(-400) : '(belum ada catatan)';
    const systemPrompt = `Anda adalah Sales Strategy AI untuk PT PIRANUSA (distributor software CAD/BIM: ZWCAD, ZW3D, Archicad, Sketchup, D5 Render, Chaos Vray/Enscape/Corona, Eptar).
Tugas: berikan SATU rekomendasi aksi terbaik untuk menggerakkan lead berikut, plus alasan dan draf pesan siap kirim.
Gaya: sopan, profesional, Bahasa Indonesia. Pesan hangat & to the point (2-4 kalimat).
PENTING: Balas HANYA dengan JSON, tanpa penjelasan, tanpa markdown.`;

    const userPrompt = `DATA LEAD:
- Nama: ${c.name}
- Perusahaan: ${c.company || '-'}
- Jabatan: ${c.jobTitle || '-'}
- Stage Pipeline: ${c.pipelineStatus}
- Potensi Revenue: Rp ${(c.potentialRevenue || 0).toLocaleString('id-ID')}
- Sumber: ${c.acquisitionContext?.source || '-'}
- Aktivitas terakhir: ${lastActivity}
- Produk terkait: ${c.products?.map((p) => p.name).join(', ') || '-'}

Balas dengan PERSIS format JSON ini (key harus sama persis, value dalam Bahasa Indonesia):
{
  "action": "satu kalimat saran aksi konkret",
  "reason": "alasan singkat mengapa aksi ini, maks 2 kalimat",
  "message": "draf pesan WhatsApp/email sopan & personal, 2-4 kalimat"
}`;

    const raw = await callOpenAIText({
        systemPrompt,
        userPrompt,
        temperature: 0.4,
        maxTokens: 600,
    });

    return normalize(extractJson(raw));
}
