'use server';

import { callOpenAI } from '@/ai/openai-client';
import { z } from 'zod';

const EmailGenerationInputSchema = z.object({
    emailType: z.enum(['thanksLetter', 'promotion', 'invitation', 'news']),
    eventName: z.string().optional(),
    eventDate: z.string().optional(),
    eventKeyPoints: z.string().optional().describe("1-3 key takeaways from the event."),
    offerDemo: z.boolean().optional(),
    promoProduct: z.string().optional(),
    promoDetails: z.string().optional(),
    promoTargetAudience: z.string().optional(),
    promoCTA: z.string().optional(),
    invitationType: z.enum(['Online', 'Offline']).optional(),
    invitationTitle: z.string().optional(),
    invitationDateTime: z.string().optional(),
    invitationSpeakers: z.string().optional(),
    invitationBenefits: z.string().optional().describe("2-3 key benefits for attendees."),
    invitationLocationName: z.string().optional().describe("For offline events, venue name and address."),
    invitationMapLink: z.string().optional().describe("For offline events, a Google Maps link."),
    invitationRegistrationLink: z.string().optional().describe("For online events, registration link."),
    newsContent: z.string().optional(),
    bannerImageUrl: z.string().url().optional().describe("Public URL of the banner image."),
    bannerPosition: z.enum(['none', 'top', 'middle', 'bottom']).default('none'),
});

export type EmailGenerationInput = z.infer<typeof EmailGenerationInputSchema>;

const EmailGenerationOutputSchema = z.object({
    subject: z.string().describe('The generated email subject line.'),
    body: z.string().describe('The generated email body in HTML format.'),
});

export type EmailGenerationOutput = z.infer<typeof EmailGenerationOutputSchema>;

function buildSystemPrompt(input: EmailGenerationInput): string {
    let mainInstruction = '';
    let contextData = '';

    const basePrompt = `Anda adalah seorang Email Marketing Specialist profesional dari PT Piranusa.
Tugas Anda adalah membuat draf email marketing yang menarik, profesional, dan persuasif dalam format HTML.

ATURAN WAJIB:
1. Gunakan Bahasa Indonesia yang sopan, profesional, namun tetap hangat dan mudah dibaca.
2. Sapaan Generik: "Halo para profesional," atau "Dear [Nama Perusahaan],".
3. Format HTML: Hasilkan HANYA body email dalam format HTML.
4. Struktur & Styling:
   - Bungkus SELURUH konten dalam <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; line-height: 1.6;">
   - Judul (h1/h2): color: #111827; margin-bottom: 16px; font-weight: 700;
   - Paragraf (p): margin-bottom: 16px; font-size: 16px;
   - CTA: <a href="..." style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin: 24px 0; text-align: center;">
5. Output JSON dengan field "subject" dan "body".`;

    let layoutInstruction = '';
    if (input.bannerImageUrl && input.bannerPosition !== 'none') {
        const bannerHtml = `<img src="${input.bannerImageUrl}" alt="Email Banner" style="width:100%; max-width:600px; height:auto; display:block; margin-bottom: 20px;" />`;
        switch (input.bannerPosition) {
            case 'top':
                layoutInstruction = `Letakkan banner di paling atas email:\n${bannerHtml}`;
                break;
            case 'middle':
                layoutInstruction = `Letakkan banner di tengah konten setelah paragraf pembuka:\n${bannerHtml}`;
                break;
            case 'bottom':
                layoutInstruction = `Letakkan banner di bagian bawah email sebelum salam penutup:\n${bannerHtml}`;
                break;
        }
    }

    switch (input.emailType) {
        case 'thanksLetter':
            mainInstruction = 'Buat email ucapan terima kasih (thanksletter) kepada peserta acara.';
            contextData += `Nama Acara: ${input.eventName}\nTanggal: ${input.eventDate}\nPoin Penting: ${input.eventKeyPoints}\nTawarkan Demo: ${input.offerDemo ? 'Ya, tawarkan demo dengan placeholder [[SMART_BUTTON_PLACEHOLDER]]' : 'Tidak'}`;
            break;
        case 'promotion':
            mainInstruction = 'Buat email promosi untuk produk atau layanan.';
            contextData += `Produk: ${input.promoProduct}\nDetail: ${input.promoDetails}\nTarget: ${input.promoTargetAudience}\nCTA: ${input.promoCTA}`;
            break;
        case 'invitation':
            mainInstruction = `Buat email undangan untuk acara ${input.invitationType}.`;
            contextData += `Judul: ${input.invitationTitle}\nTanggal: ${input.invitationDateTime}\nPembicara: ${input.invitationSpeakers || '-'}\nBenefit: ${input.invitationBenefits}`;
            if (input.invitationType === 'Online') {
                contextData += `\nLink Daftar: ${input.invitationRegistrationLink}`;
            } else {
                contextData += `\nLokasi: ${input.invitationLocationName}\nMap: ${input.invitationMapLink}`;
            }
            break;
        case 'news':
            mainInstruction = 'Buat email newsletter berdasarkan poin-poin berikut.';
            contextData += `${input.newsContent}`;
            break;
    }

    return `${basePrompt}

LAYOUT: ${layoutInstruction || 'Buat email berbasis teks standar tanpa gambar.'}

TUGAS: ${mainInstruction}

DATA KONTEKSTUAL:
${contextData}`;
}

export async function generateEmailBlast(input: EmailGenerationInput): Promise<EmailGenerationOutput> {
    console.log('[Flow: generateEmailBlast] Starting email generation');

    const systemPrompt = buildSystemPrompt(input);
    const userPrompt = `Buat email marketing berkualitas tinggi berdasarkan instruksi di atas.`;

    try {
        const output = await callOpenAI({
            systemPrompt,
            userPrompt,
            schema: EmailGenerationOutputSchema,
            temperature: 0.5,
            maxTokens: 2048,
        });

        if (!output) {
            throw new Error("AI failed to generate any email content.");
        }

        console.log("[Flow: generateEmailBlast] SUCCESS.");

        const currentYear = new Date().getFullYear();
        const customFooter = `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width:100%;">
            <tbody>
                <tr>
                    <td style="padding-top:9px;">
                        <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%">
                            <tbody><tr>
                                <td style="padding:0 18px 9px; text-align:center;">
                                    <h4 style="color:#FFFFFF; font-size:12px;"><strong>Follow Our Social Media</strong></h4>
                                </td>
                            </tr>
                        </tbody></table>
                    </td>
                </tr>
            </tbody>
        </table>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width:100%;">
            <tbody><tr>
                <td align="center" style="padding:9px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width:100%;">
                        <tbody><tr>
                            <td align="center" style="padding-top:9px; padding-right:9px; padding-left:9px;">
                                <table align="center" border="0" cellpadding="0" cellspacing="0">
                                    <tbody><tr>
                                        <td align="center">
                                            <a href="https://www.instagram.com/zwcad.indonesia/" target="_blank"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-light-instagram-48.png" alt="Instagram" style="display:block;" height="24" width="24"></a>
                                        </td>
                                        <td align="center" style="padding-left:10px;">
                                            <a href="https://www.facebook.com/piranusa.zwcad" target="_blank"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-light-facebook-48.png" alt="Facebook" style="display:block;" height="24" width="24"></a>
                                        </td>
                                        <td align="center" style="padding-left:10px;">
                                            <a href="https://www.piranusa.com/" target="_blank"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-light-link-48.png" alt="Website" style="display:block;" height="24" width="24"></a>
                                        </td>
                                    </tr>
                                </tbody></table>
                            </td>
                        </tr>
                    </tbody></table>
                </td>
            </tr>
        </tbody></table>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width:100%;">
            <tbody><tr>
                <td style="padding:0 18px 9px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid #FFFFFF;">
                        <tbody><tr><td><span></span></td></tr>
                    </tbody></table>
                </td>
            </tr>
        </tbody></table>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width:100%;">
            <tbody><tr>
                <td style="padding-top:9px;">
                    <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%">
                        <tbody><tr>
                            <td style="padding:0 18px 9px; font-weight:bold; text-align:center;">
                                <span style="font-size:13px; color:#FFFFFF;">Copyright &copy; ${currentYear} <a href="https://www.piranusa.com/" style="color:#FFFFFF;">piranusa.com</a>, All rights reserved.</span>
                            </td>
                        </tr>
                    </tbody></table>
                </td>
            </tr>
        </tbody></table>`;

        let finalBody = output.body;
        const lastDivIndex = finalBody.lastIndexOf('</div>');

        if (lastDivIndex !== -1) {
            const beforeFooter = finalBody.substring(0, lastDivIndex);
            const afterFooter = finalBody.substring(lastDivIndex);
            finalBody = `
            ${beforeFooter}
            <div style="background-color: #222222; color: #ffffff; padding: 20px 0; border-radius: 0 0 8px 8px; margin-top: 30px;">
                ${customFooter}
            </div>
            ${afterFooter}`;
        } else {
            finalBody = `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
                <div style="padding: 30px; color: #374151; line-height: 1.6;">
                    ${output.body}
                </div>
                <div style="background-color: #222222; color: #ffffff; padding: 20px 0; border-radius: 0 0 8px 8px;">
                    ${customFooter}
                </div>
            </div>`;
        }

        return { ...output, body: finalBody };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error during AI processing.';
        console.error(`[Flow: generateEmailBlast] FAILED:`, errorMessage);
        if (errorMessage.toLowerCase().includes('quota')) {
            throw new Error('Gagal membuat email: Batas penggunaan AI (quota) telah tercapai.');
        }
        throw new Error(`Gagal membuat konten email. Penyebab: ${errorMessage}`);
    }
}
