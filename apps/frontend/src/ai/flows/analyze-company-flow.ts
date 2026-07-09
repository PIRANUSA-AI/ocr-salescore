'use server';

import { z } from 'zod';
import { callOpenAI } from '@/ai/openai-client';
import { searchCompany, scrapeWebsiteContent } from '../../lib/serpapi';

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

export async function analyzeCompanyFlow(input: { companyName: string }) {
  const { companyName } = input;
    console.log(`[AnalyzeFlow] Starting hybrid analysis for: ${companyName}`);

    let scrapedText = "";
    let sourceUrl = "";
    let isHybridSuccess = false;

    try {
        const candidates = await searchCompany(companyName);
        for (const candidate of candidates) {
            const text = await scrapeWebsiteContent(candidate.link);
            if (text && text.length > 200) {
                scrapedText = text;
                sourceUrl = candidate.link;
                isHybridSuccess = true;
                break;
            }
        }
    } catch (error) {
        console.error("[AnalyzeFlow] Hybrid search failed.", error);
    }

    let systemPrompt: string;
    let userPrompt: string;

    if (isHybridSuccess) {
        systemPrompt = `Anda adalah Data Validator & Extractor.

INSTRUKSI:
1. Validasi Identitas: Apakah teks ini benar-benar profil perusahaan "${companyName}"?
2. Ekstraksi Data: Jika valid, ekstrak JSON berisi data lengkap sesuai schema.
3. Jika data tidak ada di teks, isi null atau referensi umum yang logis. JANGAN MENGARANG FAKTA SPESIFIK.
4. Anda BOLEH melakukan deduksi untuk "Industri", "Tech Stack Implisit", dan "Tier" berdasarkan skala operasi.
5. Reasoning: MAKSIMAL 2 KALIMAT.

Output JSON menggunakan UserAuditSchema.`;

        userPrompt = `Target Perusahaan: "${companyName}"
Sumber Data: "${sourceUrl}"

Teks yang diambil dari internet:
"""
${scrapedText}
"""`;
    } else {
        systemPrompt = `System Safe Mode.

SITUASI: Sistem gagal menemukan data valid dari internet untuk perusahaan "${companyName}".
INSTRUKSI:
1. Kembalikan JSON dengan semua nilai NULL atau "Data Tidak Ditemukan".
2. Set Industry = "Unknown".
3. Reasoning = "Gagal melakukan pencarian data. Verifikasi manual diperlukan."
JANGAN MENCOBA MENEBAK DATA.
Output JSON menggunakan UserAuditSchema.`;

        userPrompt = `Analisis perusahaan "${companyName}" (tanpa data internet).`;
    }

    let data;
    try {
        data = await callOpenAI({
            systemPrompt,
            userPrompt,
            schema: UserAuditSchema,
            temperature: 0.2,
            maxTokens: 1024,
        });
    } catch (aiError) {
        console.error("[AnalyzeFlow] AI Generation Failed:", aiError);
        data = {
            identity: {
                company_official_name: companyName,
                website_url: sourceUrl || null,
                industry_sector: "Unknown (AI Error)",
                headquarters_city: undefined,
            },
            scale_metrics: {
                employee_range: "Unknown",
                tier_classification: "SMB" as const,
            },
            operational_intelligence: {
                core_business_focus: "Gagal menganalisis detail perusahaan.",
                implied_tech_stack: [],
                known_projects_or_clients: [],
            },
            risk_profile: {
                status: "Unknown",
                notes: "Analisis gagal. Silakan coba lagi.",
            },
            audit_meta: {
                reasoning: "Terjadi kesalahan sistem saat menghubungi AI engine.",
            },
        };
    }

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
