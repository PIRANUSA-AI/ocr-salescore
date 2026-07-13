/**
 * @fileOverview Centralized server actions for customer data management.
 */
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Customer, CustomerNotes } from '@/types';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

/**
 * HELPER: Mengkonversi berbagai format tanggal (Timestamp, String, Date) menjadi ISO String dengan aman.
 * Mencegah crash jika data di DB tidak konsisten.
 */
function safeISODate(dateValue: any): string {
    if (!dateValue) return new Date().toISOString();

    // Jika itu adalah Firestore Timestamp (memiliki method toDate)
    if (typeof dateValue.toDate === 'function') {
        return dateValue.toDate().toISOString();
    }

    // Jika sudah berupa Date object native JS
    if (dateValue instanceof Date) {
        return dateValue.toISOString();
    }

    // Jika berupa string, kembalikan langsung (atau validasi jika perlu)
    if (typeof dateValue === 'string') {
        // Simple validation to check if it's a plausible ISO-like string
        if (/\d{4}-\d{2}-\d{2}/.test(dateValue)) {
            return new Date(dateValue).toISOString();
        }
        return dateValue;
    }

    // Fallback
    return new Date().toISOString();
}

/**
 * Safely serializes a notes object, converting any Timestamps to ISO strings.
 * @param notes - The notes object from Firestore.
 * @returns A plain object with date strings, or an empty object.
 */
function serializeNotes(notes: any): CustomerNotes {
    const serialized: CustomerNotes = {};

    if (!notes || typeof notes !== 'object') {
        return { manual: typeof notes === 'string' ? notes : '' };
    }

    if (notes.manual) {
        serialized.manual = notes.manual;
    }

    const serializeNoteArray = (noteArray: any[]) => {
        if (!Array.isArray(noteArray)) return [];
        return noteArray.map(note => ({
            ...note,
            // GUNAKAN HELPER BARU DI SINI
            createdAt: safeISODate(note.createdAt)
        }));
    };

    if (notes.webinar) {
        serialized.webinar = serializeNoteArray(notes.webinar);
    }
    if (notes.replyAssistant) {
        serialized.replyAssistant = serializeNoteArray(notes.replyAssistant);
    }

    return serialized;
}


/**
 * Fetches and serializes a list of customers based on optional filters.
 * @param filters - Optional filters, e.g., { assignedSalesId: 'some-id' }.
 * @returns A promise that resolves to an array of Customer objects.
 */
export async function getCustomers(filters?: { assignedSalesId?: string; team?: 'AEC' | 'MFG' }): Promise<Customer[]> {
    console.log('[Action: getCustomers] Fetching customers with filters:', filters);
    try {
        let query: FirebaseFirestore.Query = adminDb.collection('customers');

        const snapshot = await query.get();
        if (snapshot.empty) {
            console.log('[Action: getCustomers] No customers found in the database.');
            return [];
        }

        const allCustomers = snapshot.docs.map(doc => {
            const data = doc.data();

            // --- DATA MIGRATION LOGIC ---
            // If acquisitionContext doesn't exist, it's old data. We create it.
            if (!data.acquisitionContext) {
                data.acquisitionContext = {
                    source: data.source || 'Lainnya', // Fallback to old 'source' field or 'Lainnya'
                    eventName: 'MFI 2025', // As requested for old data
                    eventDate: safeISODate(data.createdAt),
                };
            }
            // Ensure context has all fields
            data.acquisitionContext.source = data.acquisitionContext.source || 'Lainnya';
            data.acquisitionContext.eventName = data.acquisitionContext.eventName || 'Tidak Diketahui';
            data.acquisitionContext.eventDate = safeISODate(data.acquisitionContext.eventDate || data.createdAt);
            // --- END OF MIGRATION LOGIC ---

            // Safety check untuk array
            const products = Array.isArray(data.products)
                ? data.products.map((p: any) => ({
                    ...p,
                    purchaseDate: safeISODate(p.purchaseDate),
                }))
                : [];

            const generationHistory = Array.isArray(data.generationHistory)
                ? data.generationHistory.map((h: any) => ({
                    ...h,
                    createdAt: safeISODate(h.createdAt),
                }))
                : [];

            return {
                ...data,
                id: doc.id,
                // GUNAKAN HELPER SAFE DI SINI
                createdAt: safeISODate(data.createdAt),
                updatedAt: safeISODate(data.updatedAt),
                products,
                notes: serializeNotes(data.notes),
                generationHistory,
                // Ensure acquisitionContext is always present on the serialized object
                acquisitionContext: data.acquisitionContext,
            } as Customer;
        });

        // Step 2: Filter the results in-memory on the server.
        const filteredCustomers = allCustomers.filter(customer => {
            const teamMatch = !filters?.team || customer.team === filters.team;
            const salesMatch = !filters?.assignedSalesId || customer.assignedSalesId === filters.assignedSalesId;
            return teamMatch && salesMatch;
        });

        // Step 3: Sort the final results by date.
        const sortedCustomers = filteredCustomers.sort((a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        console.log(`[Action: getCustomers] SUKSES. Ditemukan ${sortedCustomers.length} pelanggan setelah filter & sort.`);
        return sortedCustomers;
    } catch (error) {
        // Log error yang lebih detail agar kita tahu penyebab pastinya
        console.error('[Action: getCustomers] !!! ERROR !!!', error);
        throw new Error('Gagal mengambil data pelanggan.');
    }
}

/**
 * Fetches a single customer by their ID from the Postgres backend.
 * Calls the backend directly (absolute URL) since this runs server-side, where
 * api-client's relative `/api/v1/...` fetch has no origin to resolve against.
 * @param customerId The ID of the customer to fetch.
 * @returns A promise that resolves to a Customer object or null if not found.
 */
export async function getCustomerById(customerId: string): Promise<Customer | null> {
    console.log(`[Action: getCustomerById] Fetching customer: ${customerId}`);
    try {
        const backendUrl = process.env.BACKEND_URL || 'http://localhost:4000';
        const res = await fetch(`${backendUrl}/api/v1/customers/${customerId}`);
        if (res.status === 404) {
            console.warn(`[Action: getCustomerById] Pelanggan dengan ID ${customerId} tidak ditemukan.`);
            return null;
        }
        if (!res.ok) {
            throw new Error(`Backend returned ${res.status}`);
        }
        const { customer } = await res.json();
        console.log(`[Action: getCustomerById] SUKSES. Pelanggan ${customerId} ditemukan.`);
        return customer as Customer;
    } catch (error) {
        console.error(`[Action: getCustomerById] !!! ERROR untuk pelanggan ${customerId} !!!`, error);
        throw new Error('Gagal mengambil detail pelanggan.');
    }
}


const UpdatePrioritySchema = z.object({
    customerId: z.string(),
    newPriority: z.enum(['High', 'Medium', 'Low', 'none']),
});

/**
 * Updates or adds a priority question to a customer's formAnswers.
 */
export async function updateCustomerPriority(input: z.infer<typeof UpdatePrioritySchema>) {
    console.log(`[Action: updateCustomerPriority] Updating priority for customer: ${input.customerId}`);
    const validation = UpdatePrioritySchema.safeParse(input);
    if (!validation.success) {
        throw new Error('Input tidak valid untuk memperbarui prioritas.');
    }

    const { customerId, newPriority } = validation.data;
    const customerRef = adminDb.collection('customers').doc(customerId);

    try {
        const doc = await customerRef.get();
        if (!doc.exists) {
            throw new Error(`Pelanggan dengan ID ${customerId} tidak ditemukan.`);
        }

        const customerData = doc.data() as Customer;
        const formAnswers = customerData.formAnswers || [];

        const priorityQuestionKey = "Prioritas Pelanggan";
        const priorityIndex = formAnswers.findIndex(qa => qa.question === priorityQuestionKey);

        let updatedAnswers;
        if (priorityIndex > -1) {
            // Update existing priority
            updatedAnswers = formAnswers.map((qa, index) =>
                index === priorityIndex ? { ...qa, answer: newPriority } : qa
            );
        } else {
            // Add new priority question if it doesn't exist
            updatedAnswers = [...formAnswers, { question: priorityQuestionKey, answer: newPriority }];
        }

        await customerRef.update({
            formAnswers: updatedAnswers,
            updatedAt: FieldValue.serverTimestamp(),
        });

        console.log(`[Action: updateCustomerPriority] >>> SUKSES! Prioritas pelanggan diperbarui.`);
        return { success: true };

    } catch (error) {
        console.error(`[Action: updateCustomerPriority] !!! ERROR !!!`, error);
        throw new Error('Gagal memperbarui prioritas pelanggan.');
    }
}

/**
 * Renames a company across all customers that belong to it.
 */
export async function renameCompany(oldName: string, newName: string) {
    console.log(`[Action: renameCompany] Renaming "${oldName}" to "${newName}"...`);

    if (!oldName || !newName || oldName === newName) {
        throw new Error('Nama perusahaan lama dan baru tidak valid.');
    }

    try {
        const batch = adminDb.batch();
        const snapshot = await adminDb.collection('customers').where('company', '==', oldName).get();

        if (snapshot.empty) {
            console.log('[Action: renameCompany] No customers found with this company name.');
            return { success: true, count: 0 };
        }

        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                company: newName,
                updatedAt: FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        console.log(`[Action: renameCompany] Successfully updated ${snapshot.size} customers.`);
        return { success: true, count: snapshot.size };

    } catch (error) {
        console.error('[Action: renameCompany] Error:', error);
        throw new Error('Gagal mengganti nama perusahaan.');
    }
}

/**
 * "Deletes" a company group by removing the company name from all associated customers.
 * It strictly does NOT delete the customers, only unlinks them from the company group.
 */
export async function deleteCompanyGroup(companyName: string) {
    console.log(`[Action: deleteCompanyGroup] Dissolving company group: "${companyName}"...`);

    if (!companyName) {
        throw new Error('Nama perusahaan tidak valid.');
    }

    try {
        const batch = adminDb.batch();
        const snapshot = await adminDb.collection('customers').where('company', '==', companyName).get();

        if (snapshot.empty) {
            return { success: true, count: 0 };
        }

        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                company: FieldValue.delete(), // Or set to ''? Delete field is cleaner.
                updatedAt: FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
        console.log(`[Action: deleteCompanyGroup] Successfully removed company from ${snapshot.size} customers.`);
        return { success: true, count: snapshot.size };

    } catch (error) {
        console.error('[Action: deleteCompanyGroup] Error:', error);
        throw new Error('Gagal menghapus perusahaan.');
    }
}
