import { Hono } from 'hono';
import { ocrJobRepo } from '../repositories/ocr-jobs.js';
import type { SessionPayload } from '../types/index.js';

const ocr = new Hono<{ Variables: { session: SessionPayload | null } }>();

// POST /api/v1/ocr/jobs
ocr.post('/jobs', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { imageUrl } = await c.req.json<{ imageUrl?: string }>();
  const job = await ocrJobRepo.create({ userId: session.uid, imageUrl });
  return c.json({ job }, 201);
});

// GET /api/v1/ocr/jobs
ocr.get('/jobs', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const limit = Number(c.req.query('limit') || '10');
  const jobs = await ocrJobRepo.findRecentByUserId(session.uid, Math.min(limit, 100));
  return c.json({ jobs });
});

// GET /api/v1/ocr/jobs/:id
ocr.get('/jobs/:id', async (c) => {
  const job = await ocrJobRepo.findById(c.req.param('id'));
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ job });
});

export { ocr };
