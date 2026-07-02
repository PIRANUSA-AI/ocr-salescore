
/**
 * @fileOverview A flexible Genkit flow for generating marketing email blasts.
 * It supports different email types with dynamic, contextual inputs and image embedding.
 */
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// -------- ZOD SCHEMAS --------

const EmailGenerationInputSchema = z.object({
    // Metadata
    emailType: z.enum([
        'thanksLetter',
        'promotion',
        'invitation',
        'news',
    ]),

    // Dynamic Fields based on emailType
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
    invitationLocationName: z.string().optional().describe("For offline events, the name and address of the venue."),
    invitationMapLink: z.string().optional().describe("For offline events, a Google Maps link."),
    invitationRegistrationLink: z.string().optional().describe("For online events, the registration link."),

    newsContent: z.string().optional(),

    // Layout and Image Data
    bannerImageUrl: z.string().url().optional().describe("Public URL of the banner image."),
    bannerPosition: z.enum(['none', 'top', 'middle', 'bottom']).default('none').describe("The desired layout position for the banner image."),
});

export type EmailGenerationInput = z.infer<typeof EmailGenerationInputSchema>;

const EmailGenerationOutputSchema = z.object({
    subject: z.string().describe('The generated email subject line.'),
    body: z.string().describe('The generated email body in HTML format.'),
});

export type EmailGenerationOutput = z.infer<typeof EmailGenerationOutputSchema>;


// -------- HELPER: BUILD PROMPT --------

function buildPrompt(input: EmailGenerationInput): string {
    let mainInstruction = '';
    let contextData = '';

    // Base prompt with strict HTML and styling rules
    let basePrompt = `
      **PERAN UTAMA:**
      Anda adalah seorang *Email Marketing Specialist* profesional dari PT Piranusa.
      Tugas Anda adalah membuat draf email marketing yang menarik, profesional, dan persuasif dalam format HTML.

      **ATURAN WAJIB:**
      1.  **Gunakan Bahasa Indonesia** yang sopan, profesional, namun tetap hangat dan mudah dibaca.
      2.  **Sapaan Generik**: Gunakan sapaan umum seperti "Halo para profesional," atau "Dear [Nama Perusahaan]," karena email ini akan dikirim secara massal. Jangan gunakan nama spesifik.
      3.  **Format HTML**: Hasilkan HANYA body email dalam format HTML.
      4.  **Struktur & Styling (CRITICAL)**:
          -   **Wrapper**: Bungkus SELURUH konten dalam \`<div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; color: #374151; line-height: 1.6;">\`.
          -   **Header/Logo**: Jika tidak ada banner, jangan buat header khusus.
          -   **Typography**:
              -   Judul (h1/h2): \`color: #111827; margin-bottom: 16px; font-weight: 700;\`.
              -   Paragraf (p): \`margin-bottom: 16px; font-size: 16px;\`.
              -   List (ul/ol): \`margin-bottom: 16px; padding-left: 24px;\`.
          -   **Call to Action (CTA)**:
              -   Tombol: \`<a href="..." style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 6px; margin: 24px 0; text-align: center;">Teks Tombol</a>\`.
              -   Pastikan CTA terlihat menonjol.
      5.  **Output JSON**: Hasil akhir HARUS berupa satu objek JSON valid dengan properti "subject" dan "body".
    `;

    // Add Banner Image and Layout instructions to the prompt
    let layoutInstruction = '';
    if (input.bannerImageUrl && input.bannerPosition !== 'none') {
        const bannerHtml = `<img src="${input.bannerImageUrl}" alt="Email Banner" style="width:100%; max-width:600px; height:auto; display:block; margin-bottom: 20px;" />`;
        switch (input.bannerPosition) {
            case 'top':
                layoutInstruction = `Letakkan banner ini di paling atas email, sebelum konten teks lainnya:\n${bannerHtml}`;
                break;
            case 'middle':
                layoutInstruction = `Letakkan banner ini di tengah-tengah konten, setelah paragraf pembuka:\n${bannerHtml}`;
                break;
            case 'bottom':
                layoutInstruction = `Letakkan banner ini di bagian bawah email, sebelum salam penutup atau CTA terakhir:\n${bannerHtml}`;
                break;
        }
    }


    switch (input.emailType) {
        case 'thanksLetter':
            mainInstruction = 'Buat email **ucapan terima kasih (thanksletter)** kepada peserta yang telah menghadiri sebuah acara.';
            contextData += `
              **Konteks Acara:**
              - Nama Acara: ${input.eventName}
              - Tanggal Acara: ${input.eventDate}
              - Poin-Poin Penting yang Dibahas: ${input.eventKeyPoints}
              - Tawarkan Sesi Demo Tambahan: ${input.offerDemo ? 'Sebutkan tawaran demo, lalu HANYA tuliskan placeholder ini: [[SMART_BUTTON_PLACEHOLDER]]. JANGAN buat tombol HTML sendiri.' : 'Tidak perlu.'}
            `;
            break;

        case 'promotion':
            mainInstruction = 'Buat email **promosi** untuk produk atau layanan.';
            contextData += `
              **Detail Promosi:**
              - Produk yang Dipromosikan: ${input.promoProduct}
              - Detail Penawaran: ${input.promoDetails}
              - Target Audiens: ${input.promoTargetAudience}
              - Call-to-Action (CTA): ${input.promoCTA}
            `;
            break;

        case 'invitation':
            mainInstruction = `Buat email **undangan** untuk acara ${input.invitationType}.`;
            contextData += `
              **Detail Undangan:**
              - Judul Acara: ${input.invitationTitle}
              - Tanggal & Waktu: ${input.invitationDateTime}
              - Pembicara: ${input.invitationSpeakers || 'Tidak disebutkan'}
              - Benefit Utama untuk Peserta: ${input.invitationBenefits}
            `;
            if (input.invitationType === 'Online') {
                contextData += `- Link Pendaftaran (buat tombol CTA): ${input.invitationRegistrationLink}`;
            } else {
                contextData += `
                  - Lokasi Acara: ${input.invitationLocationName}
                  - Link Google Maps (buat tombol CTA): ${input.invitationMapLink}
                `;
            }
            break;

        case 'news':
            mainInstruction = 'Buat email **berita atau update (newsletter)** berdasarkan poin-poin yang diberikan.';
            contextData += `
                **Isi Berita (draf dari pengguna):**
                ${input.newsContent}
             `;
            break;
    }

    // Combine all parts into the final prompt
    return `
        ${basePrompt}

        **INSTRUKSI TATA LETAK (LAYOUT):**
        ${layoutInstruction || 'Buat email berbasis teks standar tanpa gambar.'}

        **TUGAS SPESIFIK:**
        ${mainInstruction}

        **DATA KONTEKSTUAL:**
        ${contextData}
    `;
}


// -------- GENKIT FLOW --------

export async function generateEmailBlast(input: EmailGenerationInput): Promise<EmailGenerationOutput> {
    return generateEmailBlastFlow(input);
}


const generateEmailBlastFlow = ai.defineFlow(
    {
        name: 'generateEmailBlastFlow',
        inputSchema: EmailGenerationInputSchema,
        outputSchema: EmailGenerationOutputSchema,
    },
    async (input) => {
        console.log('[Flow: generateEmailBlastFlow] Starting email generation with input:', input);

        const promptText = buildPrompt(input);
        const promptConfig: any = {
            model: 'googleai/gemini-2.5-flash',
            prompt: [{ text: promptText }],
            output: { schema: EmailGenerationOutputSchema },
            config: {
                temperature: 0.5,
                responseMimeType: 'application/json',
            },
        };

        try {
            const { output } = await ai.generate(promptConfig);

            if (!output) {
                throw new Error("AI failed to generate any email content.");
            }

            console.log("[Flow: generateEmailBlastFlow] SUCCESS. AI email generation complete.");

            // --- CUSTOM FOOTER INJECTION ---
            const currentYear = new Date().getFullYear();
            const customFooter = `
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
            <tbody class="mcnTextBlockOuter">
                <tr>
                    <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                        <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                            <tbody><tr>
                                <td valign="top" class="mcnTextContent" style="padding-top:0; padding-right:18px; padding-bottom:9px; padding-left:18px;">
                                    <h4 class="null" style="text-align: center;"><span style="color:#FFFFFF"><span style="font-size:12px"><strong>Follow Our Social Media</strong></span></span></h4>
                                </td>
                            </tr>
                        </tbody></table>
                    </td>
                </tr>
            </tbody>
        </table>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnFollowBlock" style="min-width:100%;">
            <tbody class="mcnFollowBlockOuter">
                <tr>
                    <td align="center" valign="top" style="padding:9px" class="mcnFollowBlockInner">
                        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnFollowContentContainer" style="min-width:100%;">
            <tbody><tr>
                <td align="center" style="padding-left:9px;padding-right:9px;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width:100%;" class="mcnFollowContent">
                        <tbody><tr>
                            <td align="center" valign="top" style="padding-top:9px; padding-right:9px; padding-left:9px;">
                                <table align="center" border="0" cellpadding="0" cellspacing="0">
                                    <tbody><tr>
                                        <td align="center" valign="top">
                                            <!-- IG -->
                                            <table align="left" border="0" cellpadding="0" cellspacing="0" style="display:inline;">
                                                <tbody><tr>
                                                    <td valign="top" style="padding-right:10px; padding-bottom:9px;" class="mcnFollowContentItemContainer">
                                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnFollowContentItem">
                                                            <tbody><tr>
                                                                <td align="left" valign="middle" style="padding-top:5px; padding-right:10px; padding-bottom:5px; padding-left:9px;">
                                                                    <table align="left" border="0" cellpadding="0" cellspacing="0" width="">
                                                                        <tbody><tr>
                                                                            <td align="center" valign="middle" width="24" class="mcnFollowIconContent">
                                                                                <a href="https://www.instagram.com/zwcad.indonesia/" target="_blank"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-light-instagram-48.png" alt="Piranusa" style="display:block;" height="24" width="24" class=""></a>
                                                                            </td>
                                                                            <td align="left" valign="middle" class="mcnFollowTextContent" style="padding-left:5px;">
                                                                                <a href="https://www.instagram.com/zwcad.indonesia/" target="" style="font-family: Helvetica;font-size: 12px;text-decoration: none;color: #FFFFFF;font-weight: bold;">Piranusa</a>
                                                                            </td>
                                                                        </tr>
                                                                    </tbody></table>
                                                                </td>
                                                            </tr>
                                                        </tbody></table>
                                                    </td>
                                                </tr>
                                            </tbody></table>
                                            <!-- FB -->
                                            <table align="left" border="0" cellpadding="0" cellspacing="0" style="display:inline;">
                                                <tbody><tr>
                                                    <td valign="top" style="padding-right:10px; padding-bottom:9px;" class="mcnFollowContentItemContainer">
                                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnFollowContentItem">
                                                            <tbody><tr>
                                                                <td align="left" valign="middle" style="padding-top:5px; padding-right:10px; padding-bottom:5px; padding-left:9px;">
                                                                    <table align="left" border="0" cellpadding="0" cellspacing="0" width="">
                                                                        <tbody><tr>
                                                                            <td align="center" valign="middle" width="24" class="mcnFollowIconContent">
                                                                                <a href="https://www.facebook.com/piranusa.zwcad" target="_blank"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-light-facebook-48.png" alt="Piranusa" style="display:block;" height="24" width="24" class=""></a>
                                                                            </td>
                                                                            <td align="left" valign="middle" class="mcnFollowTextContent" style="padding-left:5px;">
                                                                                <a href="https://www.facebook.com/piranusa.zwcad" target="" style="font-family: Helvetica;font-size: 12px;text-decoration: none;color: #FFFFFF;font-weight: bold;">Piranusa</a>
                                                                            </td>
                                                                        </tr>
                                                                    </tbody></table>
                                                                </td>
                                                            </tr>
                                                        </tbody></table>
                                                    </td>
                                                </tr>
                                            </tbody></table>
                                             <!-- WEB -->
                                            <table align="left" border="0" cellpadding="0" cellspacing="0" style="display:inline;">
                                                <tbody><tr>
                                                    <td valign="top" style="padding-right:0; padding-bottom:9px;" class="mcnFollowContentItemContainer">
                                                        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnFollowContentItem">
                                                            <tbody><tr>
                                                                <td align="left" valign="middle" style="padding-top:5px; padding-right:10px; padding-bottom:5px; padding-left:9px;">
                                                                    <table align="left" border="0" cellpadding="0" cellspacing="0" width="">
                                                                        <tbody><tr>
                                                                            <td align="center" valign="middle" width="24" class="mcnFollowIconContent">
                                                                                <a href="https://www.piranusa.com/" target="_blank"><img src="https://cdn-images.mailchimp.com/icons/social-block-v2/outline-light-link-48.png" alt="Piranusa" style="display:block;" height="24" width="24" class=""></a>
                                                                            </td>
                                                                            <td align="left" valign="middle" class="mcnFollowTextContent" style="padding-left:5px;">
                                                                                <a href="https://www.piranusa.com/" target="" style="font-family: Helvetica;font-size: 12px;text-decoration: none;color: #FFFFFF;font-weight: bold;">Website</a>
                                                                            </td>
                                                                        </tr>
                                                                    </tbody></table>
                                                                </td>
                                                            </tr>
                                                        </tbody></table>
                                                    </td>
                                                </tr>
                                            </tbody></table>
                                        </td>
                                    </tr>
                                </tbody></table>
                            </td>
                        </tr>
                    </tbody></table>
                </td>
            </tr>
        </tbody></table>
                    </td>
                </tr>
            </tbody>
        </table>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnDividerBlock" style="min-width:100%;">
            <tbody class="mcnDividerBlockOuter">
                <tr>
                    <td class="mcnDividerBlockInner" style="min-width: 100%; padding: 0px 18px 9px;">
                        <table class="mcnDividerContent" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-width: 100%;border-top: 1px solid #FFFFFF;">
                            <tbody><tr>
                                <td>
                                    <span></span>
                                </td>
                            </tr>
                        </tbody></table>
                    </td>
                </tr>
            </tbody>
        </table>
        <table border="0" cellpadding="0" cellspacing="0" width="100%" class="mcnTextBlock" style="min-width:100%;">
            <tbody class="mcnTextBlockOuter">
                <tr>
                    <td valign="top" class="mcnTextBlockInner" style="padding-top:9px;">
                        <table align="left" border="0" cellpadding="0" cellspacing="0" style="max-width:100%; min-width:100%;" width="100%" class="mcnTextContentContainer">
                            <tbody><tr>
                                <td valign="top" class="mcnTextContent" style="padding: 0px 18px 9px; font-style: normal; font-weight: bold; text-align: center;">
                                    <strong><span style="font-size:13px"><span style="color:#FFFFFF">Copyright © ${currentYear}&nbsp;</span><a href="https://www.piranusa.com/" target="_blank"><span style="color:#FFFFFF">piranusa.com</span></a><span style="color:#FFFFFF">, All rights reserved.</span></span></strong>
                                </td>
                            </tr>
                        </tbody></table>
                    </td>
                </tr>
            </tbody>
        </table>
      `;

            // Insert Custom Footer INSIDE the last closing div
            // The AI generates a wrapper div. We want the footer to be part of that wrapper if possible,
            // OR we just wrap the inner content.
            // Strategy: Find the last occurrence of "</div>" and insert the footer before it.

            let finalBody = output.body;
            const lastDivIndex = finalBody.lastIndexOf('</div>');

            if (lastDivIndex !== -1) {
                // Check if there is a wrapper. If the AI followed instructions, there is one main wrapper.
                const beforeFooter = finalBody.substring(0, lastDivIndex);
                const afterFooter = finalBody.substring(lastDivIndex);

                finalBody = `
            ${beforeFooter}
            <!-- Footer -->
            <div style="background-color: #222222; color: #ffffff; padding: 20px 0; border-radius: 0 0 8px 8px; margin-top: 30px;">
                ${customFooter}
            </div>
            ${afterFooter}
          `;
            } else {
                // Fallback if no closing div found (unlikely but possible)
                finalBody = `
            <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px;">
                <div style="padding: 30px; color: #374151; line-height: 1.6;">
                    ${output.body}
                </div>
                <div style="background-color: #222222; color: #ffffff; padding: 20px 0; border-radius: 0 0 8px 8px;">
                    ${customFooter}
                </div>
            </div>
          `;
            }

            return {
                ...output,
                body: finalBody

            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error during AI processing.';
            console.error(`[Flow: generateEmailBlastFlow] FAILED:`, errorMessage);

            if (errorMessage.toLowerCase().includes('quota')) {
                throw new Error('Gagal membuat email: Batas penggunaan AI (quota) telah tercapai.');
            }

            throw new Error(`Gagal membuat konten email. Penyebab: ${errorMessage}`);
        }
    }
);
