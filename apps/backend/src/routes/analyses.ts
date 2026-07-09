import { Hono } from 'hono';
import { analysisRepo } from '../repositories/analyses.js';
import type { SessionPayload } from '../types/index.js';

const analyses = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/analyses
analyses.get('/', async (c) => {
  const list = await analysisRepo.findAll();
  return c.json({ analyses: list });
});

// GET /api/v1/analyses/:id
analyses.get('/:id', async (c) => {
  const analysis = await analysisRepo.findById(c.req.param('id'));
  if (!analysis) return c.json({ error: 'Analysis not found' }, 404);
  return c.json({ analysis });
});

// POST /api/v1/analyses
analyses.post('/', async (c) => {
  const session: SessionPayload | null = c.get('session');
  const body = await c.req.json<{
    webinarTitle: string; webinarDate?: string; uniqueIdentifier?: string;
    prospects?: any[]; analysis?: any;
  }>();

  const result = await analysisRepo.create({
    ...body,
    createdBy: session?.uid,
  });

  return c.json({ analysis: result }, 201);
});

// PATCH /api/v1/analyses/:id
analyses.patch('/:id', async (c) => {
  const body = await c.req.json<{
    prospects?: any[]; analysis?: any;
    topicsGenerated?: boolean; insightsGenerated?: boolean;
  }>();

  await analysisRepo.update(c.req.param('id'), body);
  return c.json({ success: true });
});

// DELETE /api/v1/analyses
analyses.delete('/', async (c) => {
  const { uniqueIdentifier } = await c.req.json<{ uniqueIdentifier: string }>();
  await analysisRepo.deleteByUniqueIdentifier(uniqueIdentifier);
  return c.json({ success: true });
});

export { analyses };
