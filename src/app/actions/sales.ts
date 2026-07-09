
/**
 * @fileOverview Server actions for the Sales dashboard, including prospect management
 * and individual hook generation.
 */
'use server';

import type { Customer, UserProfile, FollowUpTasks, RenewalTask, AftersalesTask, OpportunityTask, PipelineStatus, GenerationHistoryItem, Product, FormAnswer } from '@/types';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase-admin'; // Use Admin SDK
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { PIPELINE_STAGES, PRODUCT_LIST } from '@/types';
import { generateCommunicationForCustomer, type CommunicationGenerationInput } from '@/ai/flows/generate-communication-flow';
import { getFollowUpTasks, getOpportunityTasksFromDb } from './leader';
import { logActivity } from './activity';
import { getCustomers } from './customer';
import { CUSTOMERS_CACHE_TAG } from '@/lib/cache-tags';
import { createNotification } from './notification';
import { revalidateTag } from 'next/cache';


// -------- ZOD SCHEMAS --------

const updatePipelineStatusSchema = z.object({
    customerId: z.string(),
    customerName: z.string(), // Added for logging
    newStatus: z.enum(PIPELINE_STAGES),
    actorId: z.string(), // Added for logging
    actorName: z.string(), // Added for logging
});

const FormAnswerSchema = z.object({
    question: z.string(),
    answer: z.string(),
});

const ProductSchema = z.object({
    id: z.string().optional(),
    name: z.enum(PRODUCT_LIST),
    purchaseDate: z.date(),
    version: z.string().optional(),
    quantity: z.coerce.number().min(1).default(1),
});

const updateCustomerDetailsSchema = z.object({
    customerId: z.string(),
    name: z.string().min(1, 'Nama wajib diisi.'),
    email: z.string().email('Email tidak valid.').optional().or(z.literal('')),
    phone: z.string().optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    potentialRevenue: z.number().optional(),
    notes: z.string().optional(), // For adding new notes
    products: z.array(ProductSchema).optional(),
    formAnswers: z.array(FormAnswerSchema).optional(), // Add formAnswers
    address: z.string().optional(), // Add address
});

// This schema now accepts the full, rich history object
const addGenerationToHistorySchema = z.object({
    customerId: z.string(),
    customerName: z.string(), // For logging
    historyItem: z.custom<Omit<GenerationHistoryItem, 'createdAt'>>(), // The rich object
    actorId: z.string(), // For logging
    actorName: z.string(), // For logging
});


// -------- SERVER ACTIONS --------

/**
 * Fetches all customers assigned to a specific sales person.
 * This is now a wrapper around the centralized getCustomers function.
 */
export async function getAssignedCustomers(salesId: string): Promise<Customer[]> {
    console.log(`[Action: getAssignedCustomers] Mengambil pelanggan untuk Sales ID: ${salesId}`);
    try {
        const customers = await getCustomers({ assignedSalesId: salesId });
        console.log(`[Action: getAssignedCustomers] SUKSES. Ditemukan ${customers.length} pelanggan.`);
        return customers;
    } catch (error) {
        console.error("[Action: getAssignedCustomers] !!! ERROR !!!", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Gagal mengambil daftar pelanggan yang ditugaskan.");
    }
}

/**
 * Fetches all non-AI follow-up tasks (Renewal, Aftersales) for a specific sales person.
 * AI-powered opportunity tasks are fetched separately.
 */
export async function getMyTasks(salesId: string): Promise<Omit<FollowUpTasks, 'update' | 'webinar'>> {
    console.log(`[Action: getMyTasks] Mengambil semua tugas untuk Sales ID: ${salesId}`);
    try {
        // This function now correctly returns only non-AI tasks
        const [nonAiTasks, opportunityTasks] = await Promise.all([
            getFollowUpTasks(),
            getOpportunityTasksFromDb(),
        ]);

        const myTasks: Omit<FollowUpTasks, 'update' | 'webinar'> = {
            renewal: nonAiTasks.renewal.filter(task => task.assignedSalesId === salesId),
            aftersales: nonAiTasks.aftersales.filter(task => task.assignedSalesId === salesId),
            opportunity: opportunityTasks.filter(task => task.assignedSalesId === salesId),
        };

        console.log(`[Action: getMyTasks] SUKSES. Ditemukan ${myTasks.renewal.length} renewal, ${myTasks.aftersales.length} aftersales, dan ${myTasks.opportunity.length} tugas peluang untuk Sales ID ${salesId}.`);
        return myTasks;
    } catch (error) {
        console.error("[Action: getMyTasks] !!! ERROR !!!", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Gagal mengambil daftar tugas Anda.");
    }
}


/**
 * Generates a personalized communication message for a customer based on a specific task.
 */
export async function generateCommunicationHook(input: CommunicationGenerationInput): Promise<{ generatedHook: string }> {
    console.log(`[Action: generateCommunicationHook] Dijalankan untuk Customer ID: ${input.customerId} | Tipe: ${input.communicationType}`);
    const validatedInput = z.object({
        customerId: z.string(),
        communicationType: z.enum(['whatsapp', 'email']),
        salesName: z.string(),
        communicationIntent: z.string().optional(),
        additionalContext: z.string().optional(),
        useCustomerContext: z.boolean().optional(),
    }).safeParse(input);

    if (!validatedInput.success) {
        throw new Error('Input tidak valid untuk generate pesan.');
    }

    // The actual AI generation is in the flow
    const result = await generateCommunicationForCustomer({
        ...validatedInput.data,
        useCustomerContext: validatedInput.data.useCustomerContext ?? false
    });

    console.log(`[Action: generateCommunicationHook] >>> SUKSES! Pesan berhasil dibuat.`);
    return result;
}

/**
 * Updates a customer's pipeline status.
 */
export async function updatePipelineStatus(input: z.infer<typeof updatePipelineStatusSchema>): Promise<{ success: boolean }> {
    console.log(`[Action: updatePipelineStatus] Memperbarui status untuk pelanggan ${input.customerId} menjadi ${input.newStatus}`);
    const validation = updatePipelineStatusSchema.safeParse(input);
    if (!validation.success) {
        throw new Error('Input tidak valid untuk update status pipeline.');
    }

    const { customerId, customerName, newStatus, actorId, actorName } = validation.data;

    try {
        const customerRef = adminDb.collection('customers').doc(customerId);

        // Fetch customer first to get team info for notification
        const customerDoc = await customerRef.get();
        const customerData = customerDoc.data() as Customer | undefined;

        await customerRef.update({
            pipelineStatus: newStatus,
            updatedAt: Timestamp.now(),
        });
        console.log(`[Action: updatePipelineStatus] >>> SUKSES!`);

        // Log the activity
        await logActivity({
            actorId,
            actorName,
            action: `mengubah status pipeline menjadi "${newStatus}"`,
            targetId: customerId,
            targetName: customerName,
        });

        // NOTIFICATION LOGIC: If Deal Won, notify the Leader
        if (newStatus === 'Won' && customerData?.team) {
            try {
                // Find the leader of this team
                const leaderSnapshot = await adminDb.collection('users')
                    .where('role', '==', 'Leader')
                    .where('team', '==', customerData.team)
                    .limit(1)
                    .get();

                if (!leaderSnapshot.empty) {
                    const leaderId = leaderSnapshot.docs[0].id;
                    // Don't notify if the actor IS the leader (self-update)
                    if (leaderId !== actorId) {
                        await createNotification(
                            leaderId,
                            'Deal Won! 🎉',
                            `${actorName} baru saja memenangkan deal dengan ${customerName} (${customerData.company})!`,
                            'deal_won',
                            `/dashboard/customer/${customerId}`,
                            customerId
                        );
                        console.log(`[Action: updatePipelineStatus] Notification sent to Leader ${leaderId}`);
                    }
                }
            } catch (notifyError) {
                console.error("[Action: updatePipelineStatus] Failed to send notification:", notifyError);
                // Don't fail the main action
            }
        }

        revalidateTag(CUSTOMERS_CACHE_TAG);
        return { success: true };
    } catch (error) {
        console.error('[Action: updatePipelineStatus] !!! ERROR !!!', error);
        throw new Error('Gagal memperbarui status pipeline pelanggan.');
    }
}

/**
 * Updates a customer's potential revenue and notes.
 */
export async function updateCustomerDetails(input: z.infer<typeof updateCustomerDetailsSchema>): Promise<{ success: true }> {
    console.log(`[Action: updateCustomerDetails] Memperbarui detail untuk pelanggan ${input.customerId}`);
    const validation = updateCustomerDetailsSchema.safeParse(input);
    if (!validation.success) {
        throw new Error(`Input tidak valid untuk update detail pelanggan: ${validation.error.message}`);
    }

    const { customerId, notes, products, formAnswers, ...detailsToUpdate } = validation.data;
    const now = Timestamp.now();
    const customerRef = adminDb.collection('customers').doc(customerId);

    const updateData: Record<string, any> = {
        ...detailsToUpdate,
        updatedAt: now
    };

    if (products) {
        updateData.products = products.map((p, i) => ({
            id: p.id || `prod-${now.toMillis()}-${i}`,
            name: p.name,
            purchaseDate: p.purchaseDate.toISOString(),
            version: p.version || '',
            quantity: p.quantity,
        }));
    }

    if (notes) {
        // Append new note to the manual notes field, preserving existing notes.
        const customerDoc = await customerRef.get();
        const existingNotes = customerDoc.data()?.notes?.manual || '';
        const noteTimestamp = `[${new Date().toLocaleString('id-ID')}]`;
        const newNoteEntry = `\n\n${noteTimestamp}\n${notes}`;
        updateData['notes.manual'] = `${existingNotes}${newNoteEntry}`.trim();
    }

    if (formAnswers) {
        updateData.formAnswers = formAnswers;
    }

    try {
        await customerRef.update(updateData);
        console.log(`[Action: updateCustomerDetails] >>> SUKSES!`);
        revalidateTag(CUSTOMERS_CACHE_TAG);
        return { success: true };
    } catch (error) {
        console.error('[Action: updateCustomerDetails] !!! ERROR !!!', error);
        throw new Error('Gagal memperbarui detail pelanggan.');
    }
}





/**
 * Adds a new generated message to a customer's history.
 */
export async function addGenerationToHistory(input: z.infer<typeof addGenerationToHistorySchema>): Promise<{ success: true }> {
    console.log(`[Action: addGenerationToHistory] Menambahkan riwayat ke pelanggan ${input.customerId}`);
    const validation = addGenerationToHistorySchema.safeParse(input);
    if (!validation.success) {
        throw new Error(`Input tidak valid untuk menyimpan riwayat: ${validation.error.message}`);
    }

    const { customerId, customerName, historyItem, actorId, actorName } = validation.data;

    try {
        const customerRef = adminDb.collection('customers').doc(customerId);
        const newHistoryItemWithTimestamp = {
            ...historyItem,
            createdAt: Timestamp.now(),
        };

        await customerRef.update({
            generationHistory: FieldValue.arrayUnion(newHistoryItemWithTimestamp),
            updatedAt: Timestamp.now(), // Also update the main timestamp
        });

        console.log(`[Action: addGenerationToHistory] >>> SUKSES!`);

        // Log the activity
        await logActivity({
            actorId,
            actorName,
            action: `men-generate pesan untuk`,
            targetId: customerId,
            targetName: customerName,
        });

        revalidateTag(CUSTOMERS_CACHE_TAG);
        return { success: true };
    } catch (error) {
        console.error('[Action: addGenerationToHistory] !!! ERROR !!!', error);
        throw new Error('Gagal menyimpan riwayat generasi.');
    }
}


