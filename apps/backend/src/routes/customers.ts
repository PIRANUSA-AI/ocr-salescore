import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { customerRepo } from '../repositories/customers.js';
import { userRepo } from '../repositories/users.js';
import { activityLogRepo } from '../repositories/activity-logs.js';
import { notificationRepo } from '../repositories/notifications.js';
import { getPresignedUrl } from '../lib/r2.js';
import { callOpenAI } from '../lib/openai-client.js';
import { CUSTOMER_SOURCES, PIPELINE_STAGES, PRODUCT_LIST } from '../types/index.js';
import type { SessionPayload, Customer, Product } from '../types/index.js';

const customers = new Hono<{ Variables: { session: SessionPayload | null } }>();

const productSchema = z.object({
  id: z.string().optional(),
  name: z.enum(PRODUCT_LIST),
  purchaseDate: z.string().or(z.date()),
  version: z.string().optional(),
  quantity: z.coerce.number().min(1).default(1),
});

const formAnswerSchema = z.object({ question: z.string(), answer: z.string() });

const manualCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  products: z.array(productSchema).optional(),
  imageUrl: z.string().optional(),
  imageKey: z.string().optional(),
  address: z.string().optional(),
  acquisitionContext: z.object({
    source: z.enum(CUSTOMER_SOURCES).default('Lainnya'),
    eventName: z.string().min(1),
    eventDate: z.string().or(z.date()),
  }),
  notes: z.string().optional(),
  assignedSalesId: z.string().optional().nullable(),
  assignedSalesName: z.string().optional().nullable(),
  creatorTeam: z.enum(['AEC', 'MFG']),
  formAnswers: z.array(formAnswerSchema).optional(),
  potentialRevenue: z.number().optional(),
  pipelineStatus: z.enum(PIPELINE_STAGES).optional(),
});

const bulkCustomerSchema = z.object({
  data: z.array(z.object({
    name: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    product_name: z.enum(PRODUCT_LIST),
    product_purchase_date: z.string().min(1),
    product_version: z.string().optional(),
    product_quantity: z.coerce.number().min(1).default(1),
  }).passthrough()),
  creatorTeam: z.enum(['AEC', 'MFG']),
});

function normalizeProduct(product: z.infer<typeof productSchema>, index = 0): Product {
  return {
    id: product.id || `prod-${Date.now()}-${index}`,
    name: product.name,
    purchaseDate: new Date(product.purchaseDate).toISOString(),
    version: product.version || '',
    quantity: product.quantity,
  };
}

function appendManualNote(existing: Customer['notes'] | undefined, note: string, source: string): Customer['notes'] {
  if (!note.trim()) return existing || {};
  const timestamp = `[${source} @ ${new Date().toLocaleString('id-ID')}]`;
  return {
    ...(existing || {}),
    manual: `${existing?.manual || ''}\n\n${timestamp}\n${note}`.trim(),
  };
}

const OpportunityGenerationOutputSchema = z.object({
  isOpportunity: z.boolean(),
  recommendedProduct: z.enum(PRODUCT_LIST).optional(),
  reason: z.string().optional(),
  triggeringProduct: z.enum(PRODUCT_LIST).optional(),
});

async function generateOpportunityForCustomer(customer: Customer) {
  const customerProducts = customer.products
    .map(p => `- ${p.name} (Qty: ${p.quantity}, Version: ${p.version || 'N/A'}, Purchase Date: ${p.purchaseDate})`)
    .join('\n');

  const systemPrompt = `Anda adalah seorang Sales Strategist yang sangat berpengalaman. Tugas Anda adalah menganalisis data satu pelanggan untuk menemukan satu peluang cross-sell atau upsell terbaik.

Aturan Analisis & Logika:
1. Cari Peluang: Tinjau produk yang dimiliki pelanggan. Apakah ada produk pelengkap atau versi yang lebih tinggi yang bisa ditawarkan?
   - Aturan Cross-sell 1: Jika pelanggan punya "Sketchup" tapi TIDAK punya produk rendering (D5 Render, V-Ray, Enscape, Corona), ini adalah peluang untuk "D5 Render".
   - Aturan Cross-sell 2: Jika pelanggan punya "ZWCAD" tapi TIDAK punya "ZW3D", ini adalah peluang untuk "ZW3D".
   - Jika tidak ada peluang yang jelas, set "isOpportunity" ke false.
2. Buat Alasan yang kuat dan personal berdasarkan data pelanggan.
3. Output harus JSON dengan field "isOpportunity", "recommendedProduct", "reason", dan "triggeringProduct".`;

  const userPrompt = `Data Pelanggan:
- Nama: ${customer.name}
- Jabatan: ${customer.jobTitle}
- Perusahaan: ${customer.company}
- Produk yang Dimiliki:
${customerProducts}
- Bergabung Sejak: ${customer.createdAt}

Analisis peluang cross-sell/upsell untuk pelanggan ini.`;

  try {
    const result = await callOpenAI({
      systemPrompt,
      userPrompt,
      schema: OpportunityGenerationOutputSchema,
      temperature: 0.3,
      maxTokens: 1024,
    });

    if (!result.isOpportunity || !result.recommendedProduct || !result.triggeringProduct || !result.reason) {
      return null;
    }

    return {
      id: randomUUID(),
      customerId: customer.id,
      customerName: customer.name,
      customerCompany: customer.company || '',
      assignedSalesId: customer.assignedSalesId,
      assignedSalesName: customer.assignedSalesName || null,
      recommendedProduct: result.recommendedProduct,
      triggeringProduct: result.triggeringProduct,
      reason: result.reason,
    };
  } catch (error) {
    console.error(`[opportunity] failed for customer ${customer.id}:`, error);
    return null;
  }
}

async function refreshImageUrl(c: Customer): Promise<Customer> {
  if (c.imageKey) {
    try {
      let key = c.imageKey;
      if (key.startsWith('http')) {
        const url = new URL(key);
        key = url.pathname.slice(1);
      }
      c.imageUrl = await getPresignedUrl(key, 3600);
    } catch { /* keep existing/stale imageUrl */ }
  }
  return c;
}

// GET /api/v1/customers
customers.get('/', async (c) => {
  const team = c.req.query('team') as 'AEC' | 'MFG' | undefined;
  const assignedSalesId = c.req.query('assignedSalesId');
  const event = c.req.query('event');
  const eventDate = c.req.query('eventDate');
  const from = c.req.query('from');
  const to = c.req.query('to');
  const session: SessionPayload | null = c.get('session');

  // Multi-team support: jika user punya secondaryTeam, return kedua tim
  let teams: ('AEC' | 'MFG')[] | undefined;
  if (session?.secondaryTeam && session.secondaryTeam !== session.team) {
    teams = [session.team, session.secondaryTeam];
  }

  const list = await customerRepo.findAll({
    assignedSalesId,
    team: teams ? undefined : team,
    teams,
    event,
    eventDate,
    from,
    to,
  });
  const withUrls = await Promise.all(list.map(refreshImageUrl));
  return c.json({ customers: withUrls });
});

// POST /api/v1/customers/opportunities/analyze — generate opportunity tasks from current DB data
customers.post('/opportunities/analyze', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const filters = session.role === 'Superadmin'
    ? undefined
    : session.role === 'Leader'
      ? (session.secondaryTeam && session.secondaryTeam !== session.team
          ? { teams: [session.team, session.secondaryTeam] }
          : { team: session.team })
      : { assignedSalesId: session.uid };
  const customersForAnalysis = await customerRepo.findAll(filters);
  const createdTasks: any[] = [];
  const batchSize = 5;

  for (let i = 0; i < customersForAnalysis.length; i += batchSize) {
    const batch = customersForAnalysis.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(generateOpportunityForCustomer));
    for (const task of results) {
      if (task) createdTasks.push(task);
    }
    if (i + batchSize < customersForAnalysis.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return c.json({ tasks: createdTasks });
});

// GET /api/v1/customers/:id
customers.get('/:id', async (c) => {
  const id = c.req.param('id');
  const customer = await customerRepo.findById(id);
  if (!customer) return c.json({ error: 'Customer not found' }, 404);
  return c.json({ customer: await refreshImageUrl(customer) });
});

// POST /api/v1/customers
customers.post('/', async (c) => {
  const session: SessionPayload | null = c.get('session');
  const body = await c.req.json();
  const customer = await customerRepo.create(body);

  await activityLogRepo.create({
    actorId: session?.uid || 'system',
    actorName: session?.name || 'System',
    action: `menambahkan pelanggan baru ${body.name}`,
    targetId: customer.id,
    targetName: body.name,
  });

  return c.json({ customer }, 201);
});

// POST /api/v1/customers/manual — upsert customer from OCR/manual/reply assistant flows
customers.post('/manual', async (c) => {
  const body = manualCustomerSchema.parse(await c.req.json());
  const { acquisitionContext, formAnswers = [], products = [] } = body;
  const source = acquisitionContext.source;
  const formattedProducts = products.map(normalizeProduct);

  let combinedNotes = body.notes || '';
  if (source === 'OCR' && formAnswers.length > 0) {
    const formNotes = formAnswers.map(qa => `${qa.question}: ${qa.answer}`).join('\n');
    combinedNotes = `${body.notes ? `${body.notes}\n` : ''}[Data dari Form OCR]\n${formNotes}`;
  }

  const existing = body.email ? await customerRepo.findByEmail(body.email) : null;
  if (existing) {
    await customerRepo.update(existing.id, {
      name: body.name,
      email: body.email || '',
      phone: body.phone || '',
      company: body.company || '',
      jobTitle: body.jobTitle || '',
      assignedSalesId: body.assignedSalesId || null,
      assignedSalesName: body.assignedSalesName || null,
      team: body.creatorTeam,
      formAnswers,
      imageUrl: body.imageUrl || '',
      imageKey: body.imageKey || '',
      address: body.address || '',
      acquisitionContext: {
        ...acquisitionContext,
        eventDate: new Date(acquisitionContext.eventDate).toISOString(),
      },
      products: formattedProducts.length > 0 ? [...(existing.products || []), ...formattedProducts] : existing.products,
      notes: appendManualNote(existing.notes, combinedNotes, source),
      potentialRevenue: body.potentialRevenue,
      pipelineStatus: body.pipelineStatus,
    });
    return c.json({ success: true, customerId: existing.id, status: 'updated' });
  }

  const customer = await customerRepo.create({
    name: body.name,
    email: body.email || '',
    phone: body.phone || '',
    company: body.company || '',
    jobTitle: body.jobTitle || '',
    team: body.creatorTeam,
    address: body.address || undefined,
    products: formattedProducts,
    assignedSalesId: body.assignedSalesId || null,
    assignedSalesName: body.assignedSalesName || null,
    pipelineStatus: body.pipelineStatus || 'Leads Generation 10%',
    acquisitionContext: {
      ...acquisitionContext,
      eventDate: new Date(acquisitionContext.eventDate).toISOString(),
    },
    webinarHistory: [],
    formAnswers,
    notes: appendManualNote({}, combinedNotes, source),
    generationHistory: [],
    imageUrl: body.imageUrl || '',
    imageKey: body.imageKey || '',
    potentialRevenue: body.potentialRevenue,
  });
  return c.json({ success: true, customerId: customer.id, status: 'created' }, 201);
});

// POST /api/v1/customers/bulk — import structured Excel rows
customers.post('/bulk', async (c) => {
  const { data, creatorTeam } = bulkCustomerSchema.parse(await c.req.json());
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of data) {
    const purchaseDate = new Date(row.product_purchase_date);
    if (Number.isNaN(purchaseDate.getTime())) {
      skipped++;
      continue;
    }

    const product: Product = {
      id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: row.product_name,
      purchaseDate: purchaseDate.toISOString(),
      version: row.product_version || '',
      quantity: row.product_quantity,
    };

    const existing = await customerRepo.findByEmail(row.email);
    if (existing) {
      await customerRepo.update(existing.id, { products: [...(existing.products || []), product] });
      updated++;
    } else {
      await customerRepo.create({
        name: row.name,
        email: row.email,
        phone: row.phone || '',
        company: row.company || '',
        jobTitle: row.jobTitle || '',
        team: creatorTeam,
        products: [product],
        assignedSalesId: null,
        assignedSalesName: null,
        pipelineStatus: 'Leads Generation 10%',
        webinarHistory: [],
        acquisitionContext: { source: 'Excel', eventName: 'Impor Massal dari Excel', eventDate: new Date().toISOString() },
      });
      created++;
    }
  }

  return c.json({ success: created > 0 || updated > 0, created, updated, skipped });
});

// POST /api/v1/customers/:id/assign-note — assign sales and append reply-assistant note
customers.post('/:id/assign-note', async (c) => {
  const id = c.req.param('id');
  const { salesId, salesName, note } = z.object({
    salesId: z.string(),
    salesName: z.string(),
    note: z.string().optional().default(''),
  }).parse(await c.req.json());

  const customer = await customerRepo.findById(id);
  if (!customer) return c.json({ error: 'Customer not found' }, 404);

  const notes = { ...(customer.notes || {}) };
  if (note.trim()) {
    notes.replyAssistant = [
      ...(notes.replyAssistant || []),
      { text: note, createdAt: new Date().toISOString() },
    ];
  }

  await customerRepo.update(id, { assignedSalesId: salesId, assignedSalesName: salesName, notes });
  await notificationRepo.create({
    userId: salesId,
    title: 'Tugas Baru',
    message: `Anda ditugaskan ke pelanggan ${customer.name}. Catatan: "${note}"`,
    type: 'assignment',
    link: `/dashboard/customer/${id}`,
    relatedId: id,
  });

  return c.json({ success: true });
});

// POST /api/v1/customers/:id/generation-history — append generated AI message history
customers.post('/:id/generation-history', async (c) => {
  const session: SessionPayload | null = c.get('session');
  const id = c.req.param('id');
  const { historyItem } = z.object({ historyItem: z.any() }).parse(await c.req.json());

  const customer = await customerRepo.findById(id);
  if (!customer) return c.json({ error: 'Customer not found' }, 404);

  await customerRepo.update(id, {
    generationHistory: [
      ...(customer.generationHistory || []),
      { ...historyItem, createdAt: new Date().toISOString() },
    ],
  });

  await activityLogRepo.create({
    actorId: session?.uid || 'system',
    actorName: session?.name || 'System',
    action: 'men-generate pesan untuk',
    targetId: id,
    targetName: customer.name,
  });

  return c.json({ success: true });
});

// PATCH /api/v1/customers/:id
customers.patch('/:id', async (c) => {
  const session: SessionPayload | null = c.get('session');
  const id = c.req.param('id');
  const body = await c.req.json();
  await customerRepo.update(id, body);

  if (body.pipelineStatus) {
    const customer = await customerRepo.findById(id);
    if (customer) {
      const action = `mengubah status pipeline ${customer.name} menjadi ${body.pipelineStatus}`;
      await activityLogRepo.create({
        actorId: session?.uid || 'system',
        actorName: session?.name || 'System',
        action,
        targetId: id,
        targetName: customer.name,
      });

      if (body.pipelineStatus === 'Won' && customer.team && session?.role !== 'Leader') {
        const leaders = await userRepo.listByRole('Leader', customer.team);
        const leader = leaders[0];
        if (leader && leader.uid !== session?.uid) {
          await notificationRepo.create({
            userId: leader.uid,
            title: 'Deal Won!',
            message: `${session?.name || 'Tim sales'} baru saja memenangkan deal dengan ${customer.name} (${customer.company || '-'})!`,
            type: 'deal_won',
            link: `/dashboard/customer/${id}`,
            relatedId: id,
          });
        }
      }
    }
  }

  return c.json({ success: true });
});

// DELETE /api/v1/customers/:id
customers.delete('/:id', async (c) => {
  await customerRepo.delete(c.req.param('id'));
  return c.json({ success: true });
});

// PATCH /api/v1/customers/:id/priority
customers.patch('/:id/priority', async (c) => {
  const id = c.req.param('id');
  const schema = z.object({ newPriority: z.enum(['High', 'Medium', 'Low', 'none']) });
  const { newPriority } = schema.parse(await c.req.json());

  const customer = await customerRepo.findById(id);
  if (!customer) return c.json({ error: 'Customer not found' }, 404);

  const existingAnswers = customer.formAnswers || [];
  const priorityKey = 'Prioritas Pelanggan';
  const idx = existingAnswers.findIndex(qa => qa.question === priorityKey);

  if (idx > -1) {
    await customerRepo.updateFormAnswer(id, priorityKey, newPriority);
  } else {
    await customerRepo.addFormAnswer(id, priorityKey, newPriority);
  }

  return c.json({ success: true });
});

// POST /api/v1/customers/rename-company
customers.post('/rename-company', async (c) => {
  const schema = z.object({ oldName: z.string(), newName: z.string() });
  const { oldName, newName } = schema.parse(await c.req.json());
  const count = await customerRepo.updateCompanyName(oldName, newName);
  return c.json({ success: true, count });
});

// POST /api/v1/customers/delete-company-group
customers.post('/delete-company-group', async (c) => {
  const schema = z.object({ companyName: z.string() });
  const { companyName } = schema.parse(await c.req.json());
  const count = await customerRepo.removeCompanyName(companyName);
  return c.json({ success: true, count });
});

// GET /api/v1/customers/search/global
customers.get('/search/global', async (c) => {
  const q = c.req.query('q') || '';
  const results = await customerRepo.searchByNameOrEmail(q);
  return c.json({ results });
});

export { customers };
