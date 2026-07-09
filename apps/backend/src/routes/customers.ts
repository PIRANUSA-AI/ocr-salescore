import { Hono } from 'hono';
import { z } from 'zod';
import { customerRepo } from '../repositories/customers.js';
import { activityLogRepo } from '../repositories/activity-logs.js';
import { notificationRepo } from '../repositories/notifications.js';
import { getPresignedUrl } from '../lib/r2.js';
import type { SessionPayload, Customer } from '../types/index.js';

const customers = new Hono<{ Variables: { session: SessionPayload | null } }>();

async function refreshImageUrl(c: Customer): Promise<Customer> {
  if (c.imageKey) {
    try {
      c.imageUrl = await getPresignedUrl(c.imageKey, 3600);
    } catch { /* keep existing/stale imageUrl */ }
  }
  return c;
}

// GET /api/v1/customers
customers.get('/', async (c) => {
  const team = c.req.query('team') as 'AEC' | 'MFG' | undefined;
  const assignedSalesId = c.req.query('assignedSalesId');
  const list = await customerRepo.findAll({ assignedSalesId, team });
  const withUrls = await Promise.all(list.map(refreshImageUrl));
  return c.json({ customers: withUrls });
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
