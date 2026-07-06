/**
 * @fileOverview Server actions for the Leader dashboard.
 */
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { Customer, Product, FollowUpTasks, RenewalTask, AftersalesTask, OpportunityTask, ProductName, UpdateTask, CustomerSource, WebinarTask, PipelineStatus, FormAnswer, AcquisitionContext } from '@/types';
import { z } from 'zod';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { PRODUCT_LIST, SUBSCRIPTION_PRODUCTS, PIPELINE_STAGES, CUSTOMER_SOURCES } from '@/types';
import { differenceInDays, add, isWithinInterval } from 'date-fns';
import { generateOpportunityForCustomer } from '@/ai/flows/generate-opportunity-flow';
import { getCustomers } from './customer';
import { getSalesUsers } from './user';
import type { UserProfile } from '@/types';
import { createNotification } from './notification';


const ProductSchema = z.object({
    id: z.string().optional(), // ID is optional because it might not exist for new products
    name: z.enum(PRODUCT_LIST, { required_error: 'Produk harus dipilih.' }),
    purchaseDate: z.date({ required_error: 'Tanggal beli wajib diisi.' }),
    version: z.string().optional(),
    quantity: z.coerce.number().min(1, 'Jumlah minimal 1.').default(1),
});

const FormAnswerSchema = z.object({
    question: z.string(),
    answer: z.string(),
});

// Updated Schema: includes notes and optional assignment fields
const ManualCustomerInputSchema = z.object({
    name: z.string().min(1, 'Nama wajib diisi.'),
    email: z.string().email('Email tidak valid.').optional().or(z.literal('')),
    phone: z.string().optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    products: z.array(ProductSchema).optional(),
    imageUrl: z.string().optional(),
    imageKey: z.string().optional(),

    acquisitionContext: z.object({
        source: z.enum(CUSTOMER_SOURCES).default('Lainnya'),
        eventName: z.string().min(1, "Nama event/konteks wajib diisi."),
        eventDate: z.date({ required_error: "Tanggal event/interaksi wajib diisi." }),
    }),

    notes: z.string().optional(),
    assignedSalesId: z.string().optional().nullable(),
    assignedSalesName: z.string().optional().nullable(),
    creatorTeam: z.enum(['AEC', 'MFG']),
    formAnswers: z.array(FormAnswerSchema).optional(),
});


// This is the correct schema for updating a customer from the dialog.
// It should only contain fields that are actually present in the form.
const UpdateCustomerInputSchema = ManualCustomerInputSchema.extend({
    customerId: z.string(),
    potentialRevenue: z.number().optional(),
    pipelineStatus: z.enum(PIPELINE_STAGES).optional(),
});


const AssignSalesSchema = z.object({
    customerId: z.string(),
    salesId: z.string(),
    salesName: z.string(),
});

const FindCustomersForUpdateSchema = z.object({
    productName: z.enum(PRODUCT_LIST),
});

// This schema represents a single row from the CSV file.
const BulkCustomerCsvRowSchema = z.object({
    name: z.string().min(1, 'Nama wajib diisi.'),
    email: z.string().email('Email tidak valid.'),
    phone: z.string().optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    product_name: z.enum(PRODUCT_LIST, { invalid_type_error: 'Nama produk tidak valid.' }),
    product_purchase_date: z.string().min(1, 'Tanggal beli produk wajib diisi.'),
    product_version: z.string().optional(),
    product_quantity: z.coerce.number().min(1, 'Jumlah produk minimal 1.').default(1),
    // Bulk import will use a generic event name & date
});


/**
 * Fetches all customers from the database.
 * Supports filtering by current user role and team to ensure data isolation.
 */
export async function getAllCustomers(currentUser?: UserProfile): Promise<Customer[]> {
    console.log(`[Action: getAllCustomers] Fetching customers. User: ${currentUser?.email || 'System/Unknown'} (${currentUser?.role})`);

    // 1. If no user is provided or user is Superadmin, return ALL customers.
    // This maintains backward compatibility for system calls (cron jobs, etc).
    if (!currentUser || currentUser.role === 'Superadmin') {
        return getCustomers();
    }

    // 2. Fetch all customers first (optimization: can be pushed to getCustomers if query complexity grows)
    const allCustomers = await getCustomers();

    // 3. Filter for LEADER
    if (currentUser.role === 'Leader') {
        // Fetch all sales users to determine who is in the Leader's team
        const salesUsers = await getSalesUsers();
        const teamSalesIds = salesUsers
            .filter(s => s.team === currentUser.team)
            .map(s => s.uid);

        return allCustomers.filter(c => {
            const isTeamMatch = c.team === currentUser.team;
            // Customer is relevant if assigned to a sales rep in the SAME TEAM
            const isAssignedToTeamMember = c.assignedSalesId && teamSalesIds.includes(c.assignedSalesId);

            // Relaxed Logic: Show if explicitly in team OR assigned to someone in team
            return isTeamMatch || isAssignedToTeamMember;
        });
    }

    // 4. Filter for SALES
    if (currentUser.role === 'Sales') {
        return allCustomers.filter(c => c.assignedSalesId === currentUser.uid);
    }

    // Default: return all (should not happen given logic above, but safe fallback)
    return allCustomers;
}


/**
 * Creates a new customer or updates an existing one (upsert).
 * If a customer with the same email exists, it updates their data. Otherwise, it creates a new one.
 */
export async function createManualCustomer(input: z.infer<typeof ManualCustomerInputSchema>): Promise<{ success: boolean; customerId: string; status: 'created' | 'updated' }> {
    console.log('[Action: createManualCustomer] Upserting customer.');
    const validation = ManualCustomerInputSchema.safeParse(input);
    if (!validation.success) {
        const firstError = validation.error.errors[0]?.message || 'Input tidak valid.';
        throw new Error(firstError);
    }

    const { name, email, phone, company, jobTitle, products, notes, assignedSalesId, assignedSalesName, creatorTeam, formAnswers, acquisitionContext, imageUrl, imageKey } = validation.data;
    const now = Timestamp.now();

    const customerData: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>> = {
        name,
        phone: phone || '',
        company: company || '',
        jobTitle: jobTitle || '',
        assignedSalesId: assignedSalesId || null,
        assignedSalesName: assignedSalesName || null,
        team: creatorTeam,
        formAnswers: formAnswers || [],
        imageUrl: imageUrl || '',
        imageKey: imageKey || '',
        acquisitionContext: {
            ...acquisitionContext,
            eventDate: acquisitionContext.eventDate.toISOString(),
        },
    };

    if (products && products.length > 0) {
        customerData.products = products.map((p, i) => ({
            id: `prod-${now.toMillis()}-${i}`,
            name: p.name,
            purchaseDate: p.purchaseDate.toISOString(),
            version: p.version || '',
            quantity: p.quantity,
        }));
    }

    const { source } = acquisitionContext;
    let combinedNotes = notes || '';
    if (source === 'OCR' && formAnswers && formAnswers.length > 0) {
        const formNotes = formAnswers.map(qa => `${qa.question}: ${qa.answer}`).join('\n');
        const salesNote = notes ? `${notes}\n` : '';
        combinedNotes = `${salesNote}[Data dari Form OCR]\n${formNotes}`;
    }


    try {
        if (email) {
            console.log(`[Action: createManualCustomer] Checking for existing email: ${email}`);
            const existingCustomerQuery = await adminDb.collection('customers').where('email', '==', email).limit(1).get();

            if (!existingCustomerQuery.empty) {
                const existingDoc = existingCustomerQuery.docs[0];
                console.log(`[Action: createManualCustomer] Updating existing customer ID: ${existingDoc.id}`);

                const existingNotes = existingDoc.data().notes || {};
                let updatedNotes = { ...existingNotes };

                if (combinedNotes) {
                    const noteTimestamp = `[${source} @ ${new Date().toLocaleString('id-ID')}]`;
                    if (source === 'Reply Assistant') {
                        updatedNotes.replyAssistant = [
                            ...(updatedNotes.replyAssistant || []),
                            { text: combinedNotes, createdAt: now }
                        ];
                    } else {
                        updatedNotes.manual = `${updatedNotes.manual || ''}\n\n${noteTimestamp}\n${combinedNotes}`.trim();
                    }
                }

                await existingDoc.ref.update({
                    ...customerData,
                    updatedAt: now,
                    notes: updatedNotes,
                    products: products && products.length > 0 ? FieldValue.arrayUnion(...customerData.products!) : existingDoc.data().products,
                    generationHistory: [], // Ensure this field exists
                    team: creatorTeam || existingDoc.data().team || null, // Prioritize new team, then existing, then null
                });
                return { success: true, customerId: existingDoc.id, status: 'updated' };
            }
        }

        console.log(`[Action: createManualCustomer] Creating new customer with source: ${source}...`);
        const newCustomerDoc = adminDb.collection('customers').doc();

        const initialNotes: any = {};
        if (combinedNotes) {
            const noteTimestamp = `[${source} @ ${new Date().toLocaleString('id-ID')}]`;
            initialNotes.manual = `${noteTimestamp}\n${combinedNotes}`;
        }

        await newCustomerDoc.set({
            ...customerData,
            email: email || '',
            notes: initialNotes,
            products: customerData.products || [],
            pipelineStatus: 'Leads Generation 10%',
            webinarHistory: [],
            createdAt: now,
            updatedAt: now,
            generationHistory: [], // Ensure this field exists
            assignedSalesId: assignedSalesId || null,
            assignedSalesName: assignedSalesName || null,
            team: creatorTeam || null, // Ensure team is set or explicitly null
        });

        console.log(`[Action: createManualCustomer] >>> SUKSES! New customer created with ID: ${newCustomerDoc.id}`);
        return { success: true, customerId: newCustomerDoc.id, status: 'created' };

    } catch (error) {
        console.error('[Action: createManualCustomer] !!! ERROR !!!', error);
        throw new Error('Gagal menyimpan pelanggan di database.');
    }
}


/**
 * Assigns a sales person to a customer or a task.
 */
export async function assignSalesToEntity(entityId: string, salesId: string, salesName: string, entityType: 'customer' | 'task') {
    console.log(`[Action: assignSalesToEntity] Menugaskan sales ke ${entityType} ${entityId}`);

    try {
        const collectionName = entityType === 'customer' ? 'customers' : 'tasks';
        const docRef = adminDb.collection(collectionName).doc(entityId);

        await docRef.update({
            assignedSalesId: salesId === 'unassigned' ? null : salesId,
            assignedSalesName: salesId === 'unassigned' ? null : salesName,
            updatedAt: Timestamp.now(),
        });

        if (entityType === 'task') {
            const taskDoc = await docRef.get();
            const taskData = taskDoc.data();
            if (taskData && taskData.customerId) {
                const customerRef = adminDb.collection('customers').doc(taskData.customerId);
                const customerDoc = await customerRef.get();
                if (customerDoc.exists && !customerDoc.data()?.assignedSalesId) {
                    await customerRef.update({
                        assignedSalesId: salesId === 'unassigned' ? null : salesId,
                        assignedSalesName: salesId === 'unassigned' ? null : salesName,
                        updatedAt: Timestamp.now(),
                    });
                    console.log(`[Action: assignSalesToEntity] Pelanggan ${taskData.customerId} juga ditugaskan ke sales.`);
                }
            }
        }


        if (salesId !== 'unassigned') {
            try {
                // Determine notification details based on entity type
                let title = 'Tugas Baru';
                let message = `Anda telah ditugaskan ke ${entityType === 'customer' ? 'pelanggan' : 'tugas'} ID: ${entityId}`;
                let link = entityType === 'customer' ? `/dashboard/customer/${entityId}` : `/dashboard/tasks`;

                if (entityType === 'customer') {
                    const customerDoc = await docRef.get();
                    const cData = customerDoc.data();
                    message = `Anda telah ditugaskan kepelanggan: ${cData?.name || entityId}`;
                }

                await createNotification(
                    salesId,
                    title,
                    message,
                    'assignment', // Notification Type
                    link,
                    entityId
                );
                console.log(`[Action: assignSalesToEntity] Notification sent to Sales ${salesId}`);
            } catch (notifyError) {
                console.error("[Action: assignSalesToEntity] Failed to send notification:", notifyError);
            }
        }

        console.log(`[Action: assignSalesToEntity] >>> SUKSES!`);
        return { success: true };
    } catch (error) {
        console.error('[Action: assignSalesToEntity] !!! ERROR !!!', error);
        throw new Error(`Gagal menugaskan sales ke ${entityType}.`);
    }
}


/**
 * Gets all fast, non-AI follow-up tasks (Renewal, Aftersales, etc.).
 */
export async function getFollowUpTasks(): Promise<Omit<FollowUpTasks, 'update' | 'webinar'>> {
    console.log('[Action: getFollowUpTasks] Memulai pengambilan tugas follow-up non-AI.');
    const customers = await getAllCustomers();
    const now = new Date();

    const renewalTasks: RenewalTask[] = [];
    const aftersalesTasks: AftersalesTask[] = [];

    customers.forEach(customer => {
        customer.products.forEach(product => {
            const purchaseDate = new Date(product.purchaseDate);

            // 1. Renewal Logic
            if (SUBSCRIPTION_PRODUCTS.includes(product.name as any)) {
                const expiryDate = add(purchaseDate, { years: 1 });
                const daysRemaining = differenceInDays(expiryDate, now);

                if (daysRemaining >= 0 && daysRemaining <= 14) {
                    renewalTasks.push({
                        customerId: customer.id,
                        customerName: customer.name,
                        customerCompany: customer.company || '',
                        assignedSalesId: customer.assignedSalesId,
                        productId: product.id,
                        productName: product.name,
                        daysRemaining: daysRemaining,
                    });
                }
            }

            // 2. Aftersales Logic
            const aftersalesDate = add(purchaseDate, { days: 30 });
            if (differenceInDays(now, aftersalesDate) === 0) {
                aftersalesTasks.push({
                    customerId: customer.id,
                    customerName: customer.name,
                    customerCompany: customer.company || '',
                    assignedSalesId: customer.assignedSalesId,
                    productId: product.id,
                    productName: product.name,
                    purchaseDate: product.purchaseDate,
                });
            }
        });
    });

    console.log(`[Action: getFollowUpTasks] SUKSES. Ditemukan ${renewalTasks.length} renewal, ${aftersalesTasks.length} tugas aftersales.`);

    return {
        renewal: renewalTasks,
        aftersales: aftersalesTasks,
        opportunity: [],
    };
}


/**
 * Runs AI analysis to find opportunities and saves them to the 'tasks' collection.
 * Returns the tasks that were created.
 */
export async function runAndSaveAiOpportunityTasks(): Promise<OpportunityTask[]> {
    console.log('[Action: runAndSaveAiOpportunityTasks] Memulai analisis peluang AI dan penyimpanan ke DB.');
    const customers = await getAllCustomers();
    const batch = adminDb.batch();
    const now = Timestamp.now();
    const createdTasks: OpportunityTask[] = [];

    // Clear existing opportunity tasks to avoid duplicates
    const existingTasksSnapshot = await adminDb.collection('tasks').where('type', '==', 'opportunity').get();
    if (!existingTasksSnapshot.empty) {
        console.log(`[Action: runAndSaveAiOpportunityTasks] Menghapus ${existingTasksSnapshot.size} tugas peluang lama.`);
        existingTasksSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    }

    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES = 1000;

    for (let i = 0; i < customers.length; i += BATCH_SIZE) {
        const batchCustomers = customers.slice(i, i + BATCH_SIZE);
        console.log(`[Action: runAndSaveAiOpportunityTasks] Memproses batch ${Math.floor(i / BATCH_SIZE) + 1}...`);

        try {
            const batchPromises = batchCustomers.map(customer => generateOpportunityForCustomer(customer));
            const batchResults = await Promise.all(batchPromises);

            batchResults.forEach(task => {
                if (task) {
                    const taskId = `task-opp-${task.customerId}`;
                    const taskRef = adminDb.collection('tasks').doc(taskId);
                    const taskWithMetadata = {
                        ...task,
                        id: taskId,
                        type: 'opportunity',
                        createdAt: now,
                        updatedAt: now,
                    };
                    batch.set(taskRef, taskWithMetadata);

                    // Create a serializable version for returning
                    createdTasks.push({
                        ...task,
                        id: taskId,
                        createdAt: now.toDate().toISOString(),
                        updatedAt: now.toDate().toISOString(),
                    } as OpportunityTask);
                }
            });

            if (i + BATCH_SIZE < customers.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        } catch (error) {
            console.error(`[Action: runAndSaveAiOpportunityTasks] !!! ERROR di batch ${i / BATCH_SIZE + 1} !!!`, error);
        }
    }

    await batch.commit();
    console.log(`[Action: runAndSaveAiOpportunityTasks] SUKSES. Analisis AI selesai, ${createdTasks.length} tugas peluang dibuat/diperbarui di DB.`);
    return createdTasks;
}


/**
 * Fetches opportunity tasks directly from the 'tasks' collection in Firestore.
 */
export async function getOpportunityTasksFromDb(): Promise<OpportunityTask[]> {
    console.log("[Action: getOpportunityTasksFromDb] Mengambil tugas peluang dari Firestore.");
    try {
        const snapshot = await adminDb.collection('tasks').where('type', '==', 'opportunity').get();
        if (snapshot.empty) {
            return [];
        }
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...(data as any),
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
                updatedAt: (data.updatedAt as Timestamp).toDate().toISOString(),
            } as OpportunityTask;
        });
    } catch (error) {
        console.error("[Action: getOpportunityTasksFromDb] !!! ERROR !!!", error);
        throw new Error("Gagal mengambil tugas peluang dari database.");
    }
}


/**
 * Updates an existing customer document.
 */
export async function updateCustomer(input: z.infer<typeof UpdateCustomerInputSchema>) {
    console.log(`[Action: updateCustomer] Updating customer ID: ${input.customerId}`);
    const validation = UpdateCustomerInputSchema.safeParse(input);
    if (!validation.success) {
        const firstError = validation.error.errors[0]?.message || 'Input tidak valid.';
        throw new Error(firstError);
    }

    const { customerId, name, email, phone, company, jobTitle, products, potentialRevenue, pipelineStatus, acquisitionContext, notes } = validation.data;
    const now = Timestamp.now();

    const formattedProducts: Product[] = (products || []).map((p, i) => ({
        id: p.id || `prod-${now.toMillis()}-${i}`,
        name: p.name,
        purchaseDate: p.purchaseDate.toISOString(),
        version: p.version || '',
        quantity: p.quantity,
    }));

    // Only update fields that come from the form
    const customerUpdateData: Record<string, any> = {
        name,
        email: email || '',
        phone: phone || '',
        company: company || '',
        jobTitle: jobTitle || '',
        products: formattedProducts,
        updatedAt: now,
    };

    if (potentialRevenue !== undefined) {
        customerUpdateData.potentialRevenue = potentialRevenue;
    }
    if (pipelineStatus) {
        customerUpdateData.pipelineStatus = pipelineStatus;
    }
    if (acquisitionContext) {
        customerUpdateData.acquisitionContext = {
            ...acquisitionContext,
            eventDate: acquisitionContext.eventDate.toISOString(),
        };
    }
    if (notes) {
        const noteTimestamp = `[Manual @ ${new Date().toLocaleString('id-ID')}]`;
        customerUpdateData['notes.manual'] = FieldValue.arrayUnion(`${noteTimestamp}\n${notes}`);
    }


    try {
        const customerRef = adminDb.collection('customers').doc(customerId);
        await customerRef.update(customerUpdateData);
        console.log(`[Action: updateCustomer] >>> SUKSES! Pelanggan ${customerId} diperbarui.`);
        return { success: true };
    } catch (error) {
        console.error('[Action: updateCustomer] !!! ERROR !!!', error);
        throw new Error('Gagal memperbarui data pelanggan.');
    }
}

/**
 * Finds customers who own a specific product for an update campaign.
 */
export async function findCustomersForUpdate(input: z.infer<typeof FindCustomersForUpdateSchema>): Promise<UpdateTask[]> {
    console.log(`[Action: findCustomersForUpdate] Mencari pelanggan untuk produk: ${input.productName}`);
    const validation = FindCustomersForUpdateSchema.safeParse(input);
    if (!validation.success) {
        throw new Error('Input tidak valid.');
    }
    const { productName } = validation.data;

    try {
        // This function already has logging, so we reuse it
        const allCustomers = await getAllCustomers();
        const relevantCustomers: UpdateTask[] = [];

        allCustomers.forEach(customer => {
            const ownedProduct = customer.products.find(p => p.name === productName);
            if (ownedProduct) {
                relevantCustomers.push({
                    customerId: customer.id,
                    customerName: customer.name,
                    customerCompany: customer.company || '',
                    assignedSalesId: customer.assignedSalesId,
                    productId: ownedProduct.id,
                    productName: ownedProduct.name,
                    currentVersion: ownedProduct.version || 'N/A',
                });
            }
        });

        console.log(`[Action: findCustomersForUpdate] SUKSES. Ditemukan ${relevantCustomers.length} pelanggan untuk kampanye update ${productName}.`);
        return relevantCustomers;

    } catch (error) {
        console.error('[Action: findCustomersForUpdate] !!! ERROR !!!', error);
        throw new Error(`Gagal mencari pelanggan untuk update produk ${productName}.`);
    }
}

/**
 * Creates or updates multiple customer documents from a structured CSV upload.
 * If a customer with the same email exists, it adds the product to them.
 * If not, it creates a new customer.
 */
export async function createBulkCustomers(
    customerData: z.infer<typeof BulkCustomerCsvRowSchema>[],
    creatorTeam: 'AEC' | 'MFG'
): Promise<{ success: boolean; created: number; updated: number; skipped: number; error?: string }> {
    console.log(`[Action: createBulkCustomers] Processing ${customerData.length} rows from CSV for team ${creatorTeam}.`);

    const now = Timestamp.now();
    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    const BATCH_SIZE = 400; // Firestore batch limit is 500 writes
    const batches: FirebaseFirestore.WriteBatch[] = [adminDb.batch()];
    let currentBatchIndex = 0;
    let operationCount = 0;

    const acquisitionContext: Omit<AcquisitionContext, 'eventDate'> = {
        source: 'Excel',
        eventName: 'Impor Massal dari Excel',
    };

    try {
        for (const row of customerData) {
            const validation = BulkCustomerCsvRowSchema.safeParse(row);
            if (!validation.success) {
                console.warn(`[Action: createBulkCustomers] Skipping invalid row: ${JSON.stringify(row)}`, validation.error.flatten().fieldErrors);
                skippedCount++;
                continue;
            }

            if (operationCount >= BATCH_SIZE) {
                batches.push(adminDb.batch());
                currentBatchIndex++;
                operationCount = 0;
            }

            const currentBatch = batches[currentBatchIndex];

            const { email, name, phone, company, jobTitle, product_name, product_purchase_date, product_version, product_quantity } = validation.data;

            // Validate date format before creating the product object
            const purchaseDate = new Date(product_purchase_date);
            if (isNaN(purchaseDate.getTime())) {
                console.warn(`[Action: createBulkCustomers] Skipping row with invalid date for email ${email}: ${product_purchase_date}`);
                skippedCount++;
                continue;
            }

            const newProduct: Product = {
                id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                name: product_name,
                purchaseDate: purchaseDate.toISOString(),
                version: product_version || '',
                quantity: product_quantity,
            };

            const existingCustomerQuery = await adminDb.collection('customers').where('email', '==', email).limit(1).get();

            if (!existingCustomerQuery.empty) {
                const doc = existingCustomerQuery.docs[0];
                currentBatch.update(doc.ref, {
                    products: FieldValue.arrayUnion(newProduct),
                    updatedAt: now,
                });
                operationCount++;
                updatedCount++;
            } else {
                const docRef = adminDb.collection('customers').doc();
                const newCustomer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'products' | 'acquisitionContext'> = {
                    name,
                    email,
                    phone: phone || '',
                    company: company || '',
                    jobTitle: jobTitle || '',
                    assignedSalesId: null,
                    assignedSalesName: null,
                    pipelineStatus: 'Leads Generation 10%',
                    webinarHistory: [],
                    team: creatorTeam,
                };
                currentBatch.set(docRef, {
                    ...newCustomer,
                    products: [newProduct],
                    createdAt: now,
                    updatedAt: now,
                    acquisitionContext: {
                        ...acquisitionContext,
                        eventDate: now.toDate().toISOString(),
                    },
                });
                operationCount++;
                createdCount++;
            }
        }

        if (createdCount === 0 && updatedCount === 0 && skippedCount > 0 && customerData.length === skippedCount) {
            return { success: false, created: 0, updated: 0, skipped: 0, error: 'Tidak ada data pelanggan yang valid untuk ditambahkan. Periksa kembali format file Anda.' };
        }

        await Promise.all(batches.map(batch => batch.commit()));

        console.log(`[Action: createBulkCustomers] >>> SUKSES! Dibuat: ${createdCount}, Diperbarui: ${updatedCount}, Dilewati: ${skippedCount}.`);
        return { success: true, created: createdCount, updated: updatedCount, skipped: skippedCount };

    } catch (error) {
        console.error('[Action: createBulkCustomers] !!! ERROR !!!', error);
        return { success: false, created: 0, updated: 0, skipped: 0, error: (error as Error).message || 'Gagal menyimpan pelanggan dari CSV.' };
    }
}

/**
 * Deletes a customer document from Firestore.
 */
export async function deleteCustomer(customerId: string): Promise<{ success: boolean }> {
    console.log(`[Action: deleteCustomer] Deleting customer ID: ${customerId}`);
    try {
        if (!customerId) {
            throw new Error("Customer ID tidak valid.");
        }

        const customerRef = adminDb.collection('customers').doc(customerId);
        await customerRef.delete();

        console.log(`[Action: deleteCustomer] >>> SUKSES! Pelanggan ${customerId} berhasil dihapus.`);
        return { success: true };
    } catch (error) {
        console.error("[Action: deleteCustomer] !!! ERROR !!!", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Gagal menghapus pelanggan.");
    }
}

/**
 * Assigns a sales person to a customer and optionally adds a note.
 */
export async function assignToSalesAndAddNote(
    customerId: string,
    salesId: string,
    salesName: string,
    note: string
): Promise<{ success: boolean }> {
    console.log(`[Action: assignToSalesAndAddNote] Assigning ${customerId} to ${salesName}`);
    try {
        const customerRef = adminDb.collection('customers').doc(customerId);

        const updateData: any = {
            assignedSalesId: salesId,
            assignedSalesName: salesName,
            updatedAt: Timestamp.now(),
        };

        if (note) {
            // Menggunakan dot notation untuk update field di dalam map 'notes'
            // FIX: This should be replyAssistant, not salesAssistant
            const noteField = 'notes.replyAssistant';
            updateData[noteField] = FieldValue.arrayUnion({
                text: note,
                createdAt: Timestamp.now()
            });
        }

        await customerRef.update(updateData);

        // Notification logic
        try {
            await createNotification(
                salesId,
                'Tugas Baru',
                `Anda ditugaskan ke pelanggan ${customerId}. Catatan: "${note}"`,
                'assignment',
                `/dashboard/customer/${customerId}`,
                customerId
            );
        } catch (e) {
            console.error("Failed to notify sales:", e);
        }

        console.log(`[Action: assignToSalesAndAddNote] >>> SUKSES!`);
        return { success: true };
    } catch (error) {
        console.error('[Action: assignToSalesAndAddNote] !!! ERROR !!!', error);
        throw new Error('Gagal menugaskan sales dan menambahkan catatan.');
    }
}



















