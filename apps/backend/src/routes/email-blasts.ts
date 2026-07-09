import { Hono } from 'hono';
import { emailBlastRepo } from '../repositories/email-blasts.js';
import type { SessionPayload } from '../types/index.js';

const emailBlasts = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/email-blasts
emailBlasts.get('/', async (c) => {
  const list = await emailBlastRepo.findAll();
  return c.json({ emailBlasts: list });
});

// POST /api/v1/email-blasts
emailBlasts.post('/', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { subject, content, recipientFilter } = await c.req.json<{
    subject: string; content: string; recipientFilter?: Record<string, any>;
  }>();

  const blast = await emailBlastRepo.create({
    subject, content, recipientFilter, createdBy: session.uid,
  });

  return c.json({ emailBlast: blast }, 201);
});

// GET /api/v1/email-blasts/track — tracking pixel endpoint
emailBlasts.get('/track', async (c) => {
  const bid = c.req.query('bid');
  if (bid) {
    await emailBlastRepo.incrementClick(bid);
  }
  // Return a 1x1 transparent GIF
  c.header('Content-Type', 'image/gif');
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  return c.body(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
});

export { emailBlasts };
