import { Hono } from 'hono';
import { companyRepo } from '../repositories/companies.js';
import type { SessionPayload } from '../types/index.js';

const companies = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/companies/:id
companies.get('/:id', async (c) => {
  const company = await companyRepo.findById(c.req.param('id'));
  if (!company) return c.json({ error: 'Company not found' }, 404);
  return c.json({ company });
});

// POST /api/v1/companies
companies.post('/', async (c) => {
  const body = await c.req.json();
  const company = await companyRepo.upsert(body);
  return c.json({ company }, 201);
});

// PUT /api/v1/companies/:id
companies.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const company = await companyRepo.upsert({ ...body, id });
  return c.json({ company });
});

export { companies };
