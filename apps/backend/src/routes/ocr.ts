import { Hono } from 'hono';
import { ocrJobRepo } from '../repositories/ocr-jobs.js';
import { processOcrSync } from '../services/ocr-service.js';
import type { SessionPayload } from '../types/index.js';

const ocr = new Hono<{ Variables: { session: SessionPayload | null } }>();

// POST /api/v1/ocr/jobs — bikin job doang
ocr.post('/jobs', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const { imageUrl } = await c.req.json<{ imageUrl?: string }>();
  const job = await ocrJobRepo.create({ userId: session.uid, imageUrl });
  return c.json({ job }, 201);
});

// POST /api/v1/ocr/process — bikin job + proses langsung (sync)
ocr.post('/process', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { imageDataUri } = await c.req.json<{ imageDataUri: string }>();
  if (!imageDataUri) return c.json({ error: 'imageDataUri required' }, 400);

  const job = await processOcrSync(session.uid, imageDataUri);
  return c.json({ job }, job.status === 'done' ? 200 : 202);
});

// GET /api/v1/ocr/jobs — list job user
ocr.get('/jobs', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const limit = Number(c.req.query('limit') || '10');
  const jobs = await ocrJobRepo.findRecentByUserId(session.uid, Math.min(limit, 100));
  return c.json({ jobs });
});

// GET /api/v1/ocr/jobs/:id — detail job
ocr.get('/jobs/:id', async (c) => {
  const job = await ocrJobRepo.findById(c.req.param('id'));
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json({ job });
});

export { ocr };
