import { z } from 'zod';
import { ai } from '../genkit';
import { searchCompany, scrapeWebsiteContent } from '../../lib/serpapi';

const CompanyAnalysisInputSchema = z.object({
    companyName: z.string(),
});

const CompanyAnalysisOutputSchema = z.object({
    industry: z.string(),
    website: z.string().optional(),
    employeeCount: z.string().describe("Estimated range, e.g. '50-200'"),
    address: z.string().optional(),
    techStack: z.array(z.string()).describe("List of software/tech likely used, e.g. AutoCAD, SAP"),
    potentialTier: z.enum(['Enterprise', 'SMB', 'Startup']),
    keyProjects: z.array(z.string()).describe("List of known projects or achievements"),
    riskAssessment: z.string().describe("Short risk assessment based on public reputation"),
    summary: z.string().describe("A concise executive summary of the company profile"),
});

const UserAuditSchema = z.object({
    identity: z.object({
        company_official_name: z.string(),
        website_url: z.string().nullable(),
        industry_sector: z.string(),
        headquarters_city: z.string().optional(),
    }),
    scale_metrics: z.object({
        employee_range: z.string(),
        tier_classification: z.enum(['Enterprise', 'SMB', 'Startup']),
    }),
    operational_intelligence: z.object({
        core_business_focus: z.string(),
        implied_tech_stack: z.array(z.string()),
        known_projects_or_clients: z.array(z.string()),
    }),
    risk_profile: z.object({
        status: z.string(),
        notes: z.string(),
    }),
    audit_meta: z.object({
        reasoning: z.string(),
    }),
});

export const analyzeCompanyFlow = ai.defineFlow(
    {
        name: 'analyzeCompanyFlow',
        inputSchema: CompanyAnalysisInputSchema,
        outputSchema: CompanyAnalysisOutputSchema,
    },
    async (input) => {
        const { companyName } = input;

        console.log(`[AnalyzeFlow] Starting hybrid analysis for: ${companyName}`);

        // --- STEP 1 & 2: HYBRID SEARCH & SCRAPE ---
        let scrapedText = "";
        let sourceUrl = "";
        let isHybridSuccess = false;

        try {
            const candidates = await searchCompany(companyName);
            console.log(`[AnalyzeFlow] Total candidates to try: ${candidates.length}`);

            // Try each candidate until we get a successful scrape
            for (const candidate of candidates) {
                console.log(`[AnalyzeFlow] Trying candidate: ${candidate.link}`);
                const text = await scrapeWebsiteContent(candidate.link);

                if (text && text.length > 200) {
                    console.log(`[AnalyzeFlow] SUCCESS! Scraped ${text.length} chars from ${candidate.link}`);
                    scrapedText = text;
                    sourceUrl = candidate.link;
                    isHybridSuccess = true;
                    break; // Stop at first successful scrape
                } else {
                    console.log(`[AnalyzeFlow] FAILED to scrape ${candidate.link}, trying next...`);
                }
            }
        } catch (error) {
            console.error("[AnalyzeFlow] Hybrid search failed completely.", error);
        }

        // --- STEP 4: PROMPT SELECTION ---
        let prompt = "";

        if (isHybridSuccess) {
            console.log("[AnalyzeFlow] Using HYBRID DATA EXTRACTION Prompt");
            prompt = `
Role: Anda adalah Data Validator & Extractor. 
Tugas: Saya akan memberikan TEXT DUMP (Teks mentah) yang diambil Python dari hasil pencarian internet.

INPUT CONTEXT:
- Target Perusahaan: "${companyName}"
- Sumber Data: "${sourceUrl}" (Diambil dari ${sourceUrl.includes('linkedin') ? 'LinkedIn' : 'Google Organic'})

INSTRUKSI:
1. Validasi Identitas: 
   - Baca teks di bawah. Apakah ini benar-benar profil perusahaan "${companyName}"?
   - Hati-hati dengan nama mirip. Pastikan konteks industrinya masuk akal.
2. Ekstraksi Data:
   - Jika valid, ekstrak JSON berisi data lengkap sesuai schema.
   - Jika data tidak ada di teks, isi null atau referensi umum yang logis. JANGAN MENGARANG FAKTA SPESIFIK yang tidak ada di teks (misal nama proyek jangan dikarang).
   - Namun, Anda BOLEH melakukan deduksi (inference) untuk "Industri", "Tech Stack Impilisit", dan "Tier" berdasarkan skala operasi yang terbaca di teks.

ATURAN PENTING UNTUK FIELD "reasoning" (Summary):
- MAKSIMAL 2 KALIMAT PENDEK.
- Format: "[Nama] adalah [industri] skala [tier]. [Satu kalimat insight kunci]."
- Contoh: "PT XYZ adalah perusahaan manufaktur baja skala Enterprise. Potensi tinggi untuk produk ZWCAD MFG."

TEXT DUMP DARI PYTHON:
"""
${scrapedText}
"""

OUTPUT REQUIREMENTS:
Output JSON using strict UserAuditSchema.
`;
        } else {
            console.warn("[AnalyzeFlow] Hybrid search FAILED or returned no data. FORCING NULL OUTPUT.");
            prompt = `
Role: System Safe Mode.

SITUASI: Sistem gagal menemukan data valid dari internet untuk perusahaan "${companyName}".
INSTRUKSI:
1. Kembalikan JSON dengan semua nilai NULL atau "Data Tidak Ditemukan".
2. Set Industry = "Unknown".
3. Reasoning = "Gagal melakukan pencarian LinkedIn/Google. Verifikasi manual diperlukan."

JANGAN MENCOBA MENEBAK (HALLUCINATE) DATA.
Output JSON using UserAuditSchema.
            `;
        }

        let data;
        try {
            const response = await ai.generate({
                model: 'googleai/gemini-2.5-flash',
                prompt: prompt,
                output: { schema: UserAuditSchema },
            });

            if (!response.output) {
                throw new Error("AI failed to generate company analysis output (null).");
            }
            data = response.output;

        } catch (aiError) {
            console.error("[AnalyzeFlow] AI Generation Failed:", aiError);
            // Fallback to safe "Unknown" data instead of crashing
            data = {
                identity: {
                    company_official_name: companyName,
                    website_url: sourceUrl || null,
                    industry_sector: "Unknown (AI Error)",
                    headquarters_city: undefined
                },
                scale_metrics: {
                    employee_range: "Unknown",
                    tier_classification: "SMB" as const
                },
                operational_intelligence: {
                    core_business_focus: "Gagal menganalisis detail perusahaan.",
                    implied_tech_stack: [],
                    known_projects_or_clients: []
                },
                risk_profile: {
                    status: "Unknown",
                    notes: "Analisis gagal. Silakan coba lagi."
                },
                audit_meta: {
                    reasoning: "Terjadi kesalahan sistem saat menghubungi AI engine."
                }
            };
        }

        // Map back to the original schema to maintain compatibility with the UI/DB
        return {
            industry: data.identity.industry_sector,
            website: data.identity.website_url || undefined,
            employeeCount: data.scale_metrics.employee_range,
            address: data.identity.headquarters_city,
            techStack: data.operational_intelligence.implied_tech_stack,
            potentialTier: data.scale_metrics.tier_classification,
            keyProjects: data.operational_intelligence.known_projects_or_clients,
            riskAssessment: `${data.risk_profile.status} - ${data.risk_profile.notes}`,
            summary: `${data.identity.company_official_name}. ${data.operational_intelligence.core_business_focus}. (${data.audit_meta.reasoning})`,
        };
    }
);
