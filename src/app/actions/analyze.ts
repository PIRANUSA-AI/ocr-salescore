/**
 * @fileOverview Server actions for analyzing webinar data, now split into two phases:
 * 1. Data processing (CSV merge & prospect generation)
 * 2. AI Insights generation (on-demand)
 */
'use server';
import {
  analyzeWebinarFeedback,
  type WebinarAnalysisOutput,
} from '@/ai/flows/analyze-webinar-feedback';
import {
  recommendNextTopic,
  type TopicRecommendation,
} from '@/ai/flows/recommend-next-topic';
import {
  generateProspects,
  type GenerateHooksOutput,
} from '@/ai/flows/generate-individual-hook';
import { z } from 'zod';
import type { UserProfile, Customer, AnalysisHistoryEntry } from '@/types';
import { adminDb } from '@/lib/firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { ProspectData } from '@/types';
import crypto from 'crypto';
import Papa from 'papaparse';
import { revalidateTag } from 'next/cache';
import { CUSTOMERS_CACHE_TAG } from '@/lib/cache-tags';


// -------- ZOD SCHEMAS --------

const webinarAnalysisInputSchema = z.object({
  webinarTitle: z.string().min(1, "Judul webinar tidak boleh kosong."),
  webinarDate: z.date(),
  feedbackData: z.string().min(1, "Data CSV Feedback tidak boleh kosong."),
  userId: z.string(),
});
export type WebinarAnalysisInput = z.infer<typeof webinarAnalysisInputSchema>;


export type WebinarAnalysisResult = (
  {
    success: true;
    analysisId: string;
    webinarTitle: string;
    // insights are now optional, as they are generated on-demand
    analysis: {
        insights?: WebinarAnalysisOutput;
        topicRecommendation: TopicRecommendation | null; 
    };
    prospects: ProspectData[];
    topicsGenerated: boolean;
  } | {
    success: false;
    error: string;
  }
);

const assignProspectsSchema = z.object({
    analysisId: z.string(),
    prospects: z.array(z.custom<ProspectData>()), 
    salesId: z.string(),
    salesName: z.string(),
    leaderId: z.string(),
});

// -------- HELPER FUNCTIONS --------

/**
 * Helper untuk mencari value dari object berdasarkan beberapa kemungkinan kata kunci key.
 * Contoh: mencari "name" bisa dari key "Nama", "Nama Lengkap", "Full Name".
 */
function findValueByKeyKeywords(obj: any, keywords: string[]): string {
    if (!obj) return "";
    const foundKey = Object.keys(obj).find(k => 
        keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase()))
    );
    return foundKey ? String(obj[foundKey] || "").trim() : "";
}

/**
 * Normalizes CSV data by parsing it and converting headers to camelCase.
 * @param csvData - The raw CSV string.
 * @returns Parsed data as an array of objects.
 */
function normalizeCsvData(csvData: string): any[] {
    const { data } = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        transformHeader: header => header.trim().replace(/\s+/g, ' ').replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => index === 0 ? word.toLowerCase() : word.toUpperCase()).replace(/\s/g, '')
    });
    return data;
}

// -------- SERVER ACTIONS --------

/**
 * Performs the initial data processing of webinar CSVs.
 * It merges data, generates prospect hooks, and saves the raw results.
 * AI-powered qualitative insights are NOT generated in this step.
 */
export async function analyzeWebinar(
  input: WebinarAnalysisInput
): Promise<WebinarAnalysisResult> {
  console.log(`[Action: analyzeWebinar] Dijalankan untuk webinar: "${input.webinarTitle}"`);

  try {
    const validatedInput = webinarAnalysisInputSchema.safeParse(input);
    if (!validatedInput.success) {
      const errorMessage = validatedInput.error.errors.map(e => e.message).join(', ');
      console.error(`[Action: analyzeWebinar] Input tidak valid: ${errorMessage}`);
      throw new Error(`Input tidak valid: ${errorMessage}`);
    }

    const { webinarTitle, webinarDate, feedbackData, userId } = validatedInput.data;
    
    // Step 1: Check for duplicates
    console.log('[Action: analyzeWebinar] Step 1: Memeriksa duplikasi analisis...');
    const uniqueIdentifier = crypto.createHash('md5').update(`${webinarTitle}-${webinarDate.toISOString()}-${feedbackData}`).digest('hex');
    const duplicateQuery = await adminDb.collection('analyses').where('uniqueIdentifier', '==', uniqueIdentifier).limit(1).get();

    if (!duplicateQuery.empty) {
        console.warn(`[Action: analyzeWebinar] Ditemukan duplikat analisis dengan ID: ${duplicateQuery.docs[0].id}`);
        throw new Error('Kombinasi file CSV ini sudah pernah dianalisis. Silakan cek di tab Riwayat & Prospek.');
    }
    console.log('[Action: analyzeWebinar] Step 1: SUKSES. Tidak ada duplikasi ditemukan.');

    // Step 2: Parse CSV Data
    console.log('[Action: analyzeWebinar] Step 2: Memproses data CSV...');
    const feedbackList = normalizeCsvData(feedbackData);
    if (feedbackList.length === 0) throw new Error("Data Feedback kosong atau tidak valid.");
    
    const feedbackCsvString = Papa.unparse(feedbackList);
    console.log(`[Action: analyzeWebinar] Step 2: SUKSES. Data diproses, total ${feedbackList.length} entri.`);

    // Step 3: Generate Prospect Hooks from feedback data
    console.log('[Action: analyzeWebinar] Step 3: Membuat hook chat untuk prospek...');
    const prospectAnalysis = await generateProspects({ feedbackData: feedbackCsvString, webinarTitle });

    if (!prospectAnalysis) {
      throw new Error('Identifikasi prospek AI gagal menghasilkan respons.');
    }
    console.log('[Action: analyzeWebinar] Step 3: SUKSES. Hook chat dibuat.');
    
    // Step 4: Save to Firestore
    console.log('[Action: analyzeWebinar] Step 4: Menyimpan hasil ke database...');
    const analysisId = `analysis-${Date.now()}`;
    const now = Timestamp.now();

    // FIX: Mapping data AI ke format ProspectData yang strict
    // Kita gunakan helper findValueByKeyKeywords untuk mencocokkan kolom CSV dinamis ke field standar
    const sanitizedProspects: ProspectData[] = prospectAnalysis.generatedHooks.map((p: any) => ({
        name: findValueByKeyKeywords(p, ['nama', 'name']),
        company: findValueByKeyKeywords(p, ['perusahaan', 'company', 'instansi', 'organization']),
        email: findValueByKeyKeywords(p, ['email', 'mail']),
        phone: findValueByKeyKeywords(p, ['phone', 'mobile', 'hp', 'wa', 'whatsapp', 'telp']),
        jobTitle: findValueByKeyKeywords(p, ['jabatan', 'job', 'role', 'position']),
        hook_chat: p.hook_chat || '',
        ...p
    }));

    const analysisRef = adminDb.collection('analyses').doc(analysisId);
    await analysisRef.set({
      id: analysisId,
      webinarTitle,
      webinarDate: Timestamp.fromDate(webinarDate),
      uniqueIdentifier,
      mergedData: feedbackCsvString, 
      analysis: {
        insights: null, 
        topicRecommendation: null, 
      },
      createdBy: userId,
      createdAt: now,
      prospects: JSON.parse(JSON.stringify(sanitizedProspects)), 
      topicsGenerated: false,
      insightsGenerated: false, 
    });
    console.log('[Action: analyzeWebinar] Step 4: SUKSES. Analisis disimpan.');

    // Step 5: Return result to client
    
    const newAnalysisEntry: AnalysisHistoryEntry = {
      id: analysisId,
      webinarTitle: webinarTitle,
      webinarDate: webinarDate.toISOString(),
      createdAt: now.toDate().toISOString(),
      analysis: {
        insights: undefined, 
        topicRecommendation: null,
      },
      prospects: sanitizedProspects,
      topicsGenerated: false,
      insightsGenerated: false,
    };

    return {
      success: true,
      analysisId: analysisId, // FIX: Menambahkan properti wajib analysisId
      ...newAnalysisEntry
    };
  } catch (error) {
    console.error('[Action: analyzeWebinar] !!! UNEXPECTED ERROR !!!', error);
    const errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan tidak terduga saat analisis.';
    return { success: false, error: `${errorMessage}` };
  }
}

/**
 * Mengambil riwayat analisis untuk pengguna tertentu.
 */
export async function getAnalysisHistory(userId: string): Promise<AnalysisHistoryEntry[]> {
    console.log(`[Action: getAnalysisHistory] Mengambil riwayat untuk User ID: ${userId}`);
    try {
        const analysesRef = adminDb.collection('analyses');
        const q = analysesRef.where('createdBy', '==', userId).orderBy('createdAt', 'desc');
        const snapshot = await q.get();

        if (snapshot.empty) {
            console.log('[Action: getAnalysisHistory] Tidak ada riwayat analisis yang ditemukan.');
            return [];
        }
        
        console.log(`[Action: getAnalysisHistory] SUKSES. Ditemukan ${snapshot.docs.length} dokumen.`);
        const result = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                webinarTitle: data.webinarTitle,
                webinarDate: (data.webinarDate as Timestamp).toDate().toISOString(),
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
                analysis: data.analysis,
                prospects: data.prospects || [],
                topicsGenerated: data.topicsGenerated || false,
                insightsGenerated: data.insightsGenerated || false,
            };
        });
        return result;
    } catch (error) {
        console.error("[Action: getAnalysisHistory] !!! ERROR !!!", error);
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Gagal mengambil riwayat analisis.");
    }
}

/**
 * Deletes one or more analysis documents from Firestore.
 */
export async function deleteAnalysis(analysisIds: string[]): Promise<{success: boolean, error?: string}> {
    console.log(`[Action: deleteAnalysis] Menghapus analisis IDs: ${analysisIds.join(', ')}`);
    try {
        if (!analysisIds || analysisIds.length === 0) {
            throw new Error("Daftar ID analisis tidak valid.");
        }
        
        const batch = adminDb.batch();

        analysisIds.forEach(id => {
            const analysisRef = adminDb.collection('analyses').doc(id);
            batch.delete(analysisRef);
        });
        
        await batch.commit();

        console.log(`[Action: deleteAnalysis] >>> SUKSES! ${analysisIds.length} analisis berhasil dihapus.`);
        
        return { success: true };
    } catch (error) {
        console.error("[Action: deleteAnalysis] !!! ERROR !!!", error);
        const errorMessage = error instanceof Error ? error.message : "Gagal menghapus riwayat analisis.";
        return { success: false, error: errorMessage };
    }
}


/**
 * Assigns prospects from an analysis to a sales person, creating them as customers.
 */
export async function assignProspects(input: z.infer<typeof assignProspectsSchema>): Promise<{ success: boolean, count: number }> {
    console.log(`[Action: assignProspects] Menugaskan ${input.prospects.length} prospek ke ${input.salesName}`);
    const validation = assignProspectsSchema.safeParse(input);
    if (!validation.success) {
        throw new Error(`Input penugasan tidak valid: ${validation.error.message}`);
    }

    const { analysisId, prospects: prospectsToAssign, salesId, salesName } = validation.data;
    const now = Timestamp.now();
    const customerCreationBatch = adminDb.batch();

    try {
        if (prospectsToAssign.length === 0) {
            throw new Error("Tidak ada peserta yang dipilih untuk ditugaskan.");
        }
        
        console.log(`[Action: assignProspects] Membaca dokumen analisis ${analysisId}...`);
        const analysisRef = adminDb.collection('analyses').doc(analysisId);
        const analysisDoc = await analysisRef.get();
        if (!analysisDoc.exists) {
            console.error(`[Action: assignProspects] Dokumen analisis ${analysisId} tidak ditemukan.`);
            throw new Error(`Analisis dengan ID ${analysisId} tidak ditemukan.`);
        }
        console.log(`[Action: assignProspects] SUKSES. Dokumen analisis ${analysisId} ditemukan.`);
        const analysisData = analysisDoc.data()!;
        const allProspectsInDb = (analysisData.prospects || []) as ProspectData[];
        
        prospectsToAssign.forEach(p => {
            const customerId = `cust-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
            const customerRef = adminDb.collection('customers').doc(customerId);
            
            const newCustomer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'acquisitionContext' > = {
                name: p.name || 'Unknown',
                email: p.email,
                phone: p.phone, 
                company: p.company,
                jobTitle: p.jobTitle,
                products: [],
                assignedSalesId: salesId,
                assignedSalesName: salesName,
                pipelineStatus: 'Leads Generation 10%',
                webinarHistory: [{ webinarId: analysisId, webinarTitle: analysisData.webinarTitle }],
                notes: {
                    manual: `Prospek dari webinar "${analysisData.webinarTitle}".\nKonteks: ${p.hook_chat}`,
                    replyAssistant: [],
                    webinar: []
                },
                team: analysisData.team, // Assuming team is stored in analysis
            };

            customerCreationBatch.set(customerRef, {
                ...newCustomer,
                createdAt: now,
                updatedAt: now,
                acquisitionContext: {
                    source: 'Webinar',
                    eventName: analysisData.webinarTitle,
                    eventDate: (analysisData.webinarDate as Timestamp).toDate().toISOString(),
                },
            });
        });

        // This logic is tricky. We need a reliable identifier for a prospect.
        // Let's use the hook_chat as it should be unique per prospect in an analysis
        const assignedProspectsIdentifier = new Set(prospectsToAssign.map(p => p.hook_chat));
        
        const updatedProspectsList = allProspectsInDb.map(p => {
            if (assignedProspectsIdentifier.has(p.hook_chat)) {
                return {
                    ...p,
                    assignedSalesId: salesId,
                    assignedSalesName: salesName,
                };
            }
            return p;
        });

        // Update the document with the full prospects list, now with assignment info
        await analysisRef.update({ prospects: updatedProspectsList });
        
        // Commit the batch for creating new customers
        await customerCreationBatch.commit();

        console.log(`[Action: assignProspects] >>> SUKSES! ${prospectsToAssign.length} pelanggan baru berhasil dibuat dan status penugasan diperbarui.`);

        revalidateTag(CUSTOMERS_CACHE_TAG);
        return { success: true, count: prospectsToAssign.length };

    } catch (error) {
        console.error("[Action: assignProspects] !!! ERROR !!!", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Gagal menugaskan peserta.");
    }
}
    
/**
 * Generates topic recommendations for an existing analysis and updates it.
 */
export async function generateTopicRecommendationsForAnalysis(analysisId: string): Promise<{ success: boolean; recommendations?: TopicRecommendation['recommendations'], error?: string }> {
    console.log(`[Action: generateTopicRecommendationsForAnalysis] Dijalankan untuk analysisId: ${analysisId}`);
    try {
        const analysisRef = adminDb.collection('analyses').doc(analysisId);
        const analysisDoc = await analysisRef.get();

        if (!analysisDoc.exists) {
            throw new Error(`Analisis dengan ID ${analysisId} tidak ditemukan.`);
        }

        const analysisData = analysisDoc.data();
        if (!analysisData || !analysisData.mergedData || !analysisData.webinarTitle) {
            throw new Error("Data analisis tidak lengkap untuk menghasilkan rekomendasi topik.");
        }
        
        console.log("[Action: generateTopicRecommendationsForAnalysis] Memanggil alur AI recommendNextTopic...");
        const topicRecommendation = await recommendNextTopic({
            pollData: analysisData.mergedData,
            webinarTitle: analysisData.webinarTitle,
        });

        if (!topicRecommendation || !topicRecommendation.recommendations) {
            throw new Error("AI gagal memberikan rekomendasi topik.");
        }
        
        console.log("[Action: generateTopicRecommendationsForAnalysis] Menyimpan rekomendasi ke Firestore...");
        
        const sanitizedRecommendations = JSON.parse(JSON.stringify(topicRecommendation));
        
        await analysisRef.update({
            'analysis.topicRecommendation': sanitizedRecommendations,
            topicsGenerated: true,
        });
        
        console.log("[Action: generateTopicRecommendationsForAnalysis] >>> SUKSES!");
        return { success: true, recommendations: topicRecommendation.recommendations };
    } catch (error) {
        console.error('[Action: generateTopicRecommendationsForAnalysis] !!! UNEXPECTED ERROR !!!', error);
        const errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan tidak terduga.';
        return { success: false, error: errorMessage };
    }
}


/**
 * Generates qualitative insights for an existing analysis and updates it.
 */
export async function generateWebinarInsights(analysisId: string): Promise<{ success: boolean; insights?: WebinarAnalysisOutput, error?: string }> {
    console.log(`[Action: generateWebinarInsights] Dijalankan untuk analysisId: ${analysisId}`);
    try {
        const analysisRef = adminDb.collection('analyses').doc(analysisId);
        const analysisDoc = await analysisRef.get();

        if (!analysisDoc.exists) {
            throw new Error(`Analisis dengan ID ${analysisId} tidak ditemukan.`);
        }

        const analysisData = analysisDoc.data();
        if (!analysisData || !analysisData.mergedData) {
            throw new Error("Data gabungan (mergedData) tidak ditemukan dalam analisis untuk menghasilkan ringkasan.");
        }
        
        console.log("[Action: generateWebinarInsights] Memanggil alur AI analyzeWebinarFeedback...");
        const feedbackAnalysis = await analyzeWebinarFeedback({
            feedbackData: analysisData.mergedData,
        });

        if (!feedbackAnalysis) {
            throw new Error("AI gagal menghasilkan ringkasan webinar.");
        }
        
        console.log("[Action: generateWebinarInsights] Menyimpan ringkasan ke Firestore...");
        
        const sanitizedInsights = JSON.parse(JSON.stringify(feedbackAnalysis));
        
        await analysisRef.update({
            'analysis.insights': sanitizedInsights,
            insightsGenerated: true,
        });
        
        console.log("[Action: generateWebinarInsights] >>> SUKSES!");
        return { success: true, insights: feedbackAnalysis };
    } catch (error) {
        console.error('[Action: generateWebinarInsights] !!! UNEXPECTED ERROR !!!', error);
        const errorMessage = error instanceof Error ? error.message : 'Terjadi kesalahan tidak terduga.';
        return { success: false, error: errorMessage };
    }
}