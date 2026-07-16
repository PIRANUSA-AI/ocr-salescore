import { Hono } from 'hono';
import { ocrJobRepo } from '../repositories/ocr-jobs.js';
import { uploadOcrImage, deleteFromR2 } from '../lib/r2.js';
import { getOcrQueue, enqueueOcr } from '../lib/ocr-queue.js';
import { getRedis } from '../lib/redis.js';
import { query } from '../db/pool.js';
import type { SessionPayload } from '../types/index.js';

const ocr = new Hono<{ Variables: { session: SessionPayload | null } }>();

const MAX_PENDING_PER_USER = 5;
const MAX_QUEUE_GLOBAL = 30;

async function checkRedisHealth(): Promise<boolean> {
  try {
    const r = getRedis();
    await r.ping();
    return true;
  } catch {
    return false;
  }
}

// POST /api/v1/ocr/jobs — bikin job doang
ocr.post('/jobs', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const { imageUrl } = await c.req.json<{ imageUrl?: string }>();
  const job = await ocrJobRepo.create({ userId: session.uid, imageUrl });
  return c.json({ job }, 201);
});

// POST /api/v1/ocr/process — enqueue OCR job (async via BullMQ)
ocr.post('/process', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { imageDataUri, team } = await c.req.json<{ imageDataUri: string; team?: 'AEC' | 'MFG' }>();
  if (!imageDataUri) return c.json({ error: 'imageDataUri required' }, 400);

  // 1. Cek Redis health
  const redisOk = await checkRedisHealth();
  if (!redisOk) {
    return c.json({ error: 'OCR service sibuk, coba lagi', retryAfter: 5 }, 503);
  }

  // 2. Cek global queue depth
  const queue = getOcrQueue();
  const [waitingCount, activeCount] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
  ]);
  if (waitingCount + activeCount >= MAX_QUEUE_GLOBAL) {
    return c.json({ error: 'Antrian OCR penuh, coba lagi nanti', retryAfter: 10 }, 429);
  }

  // 3. Cek per-user pending limit
  const userPending = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM ocr_jobs WHERE user_id = $1 AND status IN ('pending','processing')`,
    [session.uid],
  );
  if (Number(userPending.rows[0]?.count ?? 0) >= MAX_PENDING_PER_USER) {
    return c.json({ error: `Kamu sudah punya ${MAX_PENDING_PER_USER} OCR antrian, selesaikan dulu` }, 429);
  }

  const resolvedTeam = team === 'MFG' ? 'MFG' : 'AEC';

  // 4. Upload ke R2 (sync — fast fail kalau R2 down)
  let imageUrl: string;
  try {
    const result = await uploadOcrImage(imageDataUri);
    imageUrl = result.url;
  } catch {
    return c.json({ error: 'Gagal upload gambar, coba lagi' }, 500);
  }

  // 5. Bikin job record di PG
  const job = await ocrJobRepo.create({ userId: session.uid, imageUrl });

  // 6. Enqueue ke BullMQ
  await enqueueOcr({ jobId: job.id, userId: session.uid, team: resolvedTeam, imageUrl });

  console.log(`[ocr] enqueued job ${job.id} (${resolvedTeam})`);
  return c.json({ job }, 202);
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

// DELETE /api/v1/ocr/jobs/:id — hapus job dan file R2
ocr.delete('/jobs/:id', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const id = c.req.param('id');
  const job = await ocrJobRepo.findById(id);
  if (!job) return c.json({ error: 'Job not found' }, 404);
  if (job.userId !== session.uid) return c.json({ error: 'Unauthorized' }, 403);

  if (job.imageUrl) {
    try {
      const url = new URL(job.imageUrl);
      const pathname = decodeURIComponent(url.pathname);
      const key = pathname.startsWith('/') ? pathname.slice(1) : pathname;
      if (key.startsWith('ocr/')) {
        await deleteFromR2(key);
      }
    } catch (err: any) {
      console.error('[ocr] delete R2 error:', err.message);
    }
  }

  const success = await ocrJobRepo.delete(id, session.uid);
  return c.json({ success });
});

export { ocr };
