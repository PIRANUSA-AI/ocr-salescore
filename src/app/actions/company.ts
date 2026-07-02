'use server';

import { z } from 'zod';
import { adminDb } from '@/lib/firebase-admin';
import { CompanyProfile } from '@/types';
import { analyzeCompanyFlow } from '@/ai/flows/analyze-company-flow';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Helper to sanitise Firestore data (convert Timestamps to strings)
 */
function sanitizeDoc(docData: any): CompanyProfile {
    const data = { ...docData };
    // Convert known Timestamp fields to ISO strings or delete them from the return object if not needed in UI
    if (data.createdAt && typeof data.createdAt.toDate === 'function') {
        data.createdAt = data.createdAt.toDate().toISOString();
    }
    if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
        data.updatedAt = data.updatedAt.toDate().toISOString();
    }
    // lastAnalysisDate is usually a string (ISO) but check just in case
    if (data.lastAnalysisDate && typeof data.lastAnalysisDate.toDate === 'function') {
        data.lastAnalysisDate = data.lastAnalysisDate.toDate().toISOString();
    }
    return data as CompanyProfile;
}

/**
 * READ-ONLY: Get existing company profile. 
 * Returns null if not found.
 */
export async function fetchCompanyProfile(companyName: string): Promise<CompanyProfile | null> {
    if (!companyName) return null;

    const companyId = companyName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    console.log(`[Action: fetchCompanyProfile] Fetching profile for: ${companyName} (${companyId})`);

    try {
        const docRef = adminDb.collection('companies').doc(companyId);
        const doc = await docRef.get();

        if (doc.exists) {
            console.log(`[Action: fetchCompanyProfile] Found cached profile.`);
            return sanitizeDoc(doc.data());
        }

        console.log(`[Action: fetchCompanyProfile] Profile not found.`);
        return null;

    } catch (error) {
        console.error(`[Action: fetchCompanyProfile] Error:`, error);
        return null;
    }
}

/**
 * WRITE: Trigger AI Analysis and save to DB.
 */
export async function performCompanyAnalysis(companyName: string): Promise<CompanyProfile | null> {
    if (!companyName) return null;

    const companyId = companyName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    console.log(`[Action: performCompanyAnalysis] Starting Analysis for: ${companyName}`);

    try {
        const result = await analyzeCompanyFlow({ companyName });

        const newProfile: CompanyProfile = {
            id: companyId,
            name: companyName,
            website: result.website || '',
            industry: result.industry,
            employeeCount: result.employeeCount,
            address: result.address || '',
            techStack: result.techStack,
            potentialTier: result.potentialTier,
            keyProjects: result.keyProjects,
            riskAssessment: result.riskAssessment,
            summary: result.summary,
            lastAnalysisDate: new Date().toISOString(),
        };

        // Save to DB with server timestamps
        await adminDb.collection('companies').doc(companyId).set({
            ...newProfile,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        });

        console.log(`[Action: performCompanyAnalysis] >>> Success!`);

        // Return clean object (we don't need to fetch back the timestamps immediately, 
        // just return the profile we created, which is safe)
        return newProfile;

    } catch (error) {
        console.error(`[Action: performCompanyAnalysis] !!! ERROR !!!`, error);
        throw new Error("Gagal melakukan analisis perusahaan.");
    }
}

// @deprecated - Keeping for backward compatibility if needed, but redirects to split functions logic
export async function getCompanyProfile(companyName: string): Promise<CompanyProfile | null> {
    const existing = await fetchCompanyProfile(companyName);
    if (existing) return existing;
    return performCompanyAnalysis(companyName);
}

export async function getDeepScanUsage(): Promise<{ usage: number, limit: number, remaining: number, serpApiRemaining: number }> {
    const PROJECT_LIMIT = 200;

    try {
        // Dynamically import to avoid circular dependency
        const { getAccountInfo } = await import('@/lib/serpapi');
        const accountInfo = await getAccountInfo();

        if (accountInfo) {
            const actualUsage = accountInfo.this_month_usage;
            const serpApiRemaining = accountInfo.total_searches_left;
            const planLimit = accountInfo.searches_per_month;

            return {
                usage: actualUsage,
                limit: planLimit, // Use exact plan limit from SerpApi
                remaining: serpApiRemaining,
                serpApiRemaining
            };
        }

        // Fallback to internal tracking if SerpApi fails
        const quotaRef = adminDb.collection('system_quotas').doc('serpapi_search');
        const doc = await quotaRef.get();
        const internalUsage = doc.exists ? (doc.data()?.usage || 0) : 0;

        return {
            usage: internalUsage,
            limit: PROJECT_LIMIT,
            remaining: Math.max(0, PROJECT_LIMIT - internalUsage),
            serpApiRemaining: -1
        };
    } catch (error) {
        console.error("Failed to fetch usage:", error);
        return { usage: 0, limit: PROJECT_LIMIT, remaining: PROJECT_LIMIT, serpApiRemaining: -1 };
    }
}
