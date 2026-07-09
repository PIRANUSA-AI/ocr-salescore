import { Hono } from 'hono';
import { notificationRepo } from '../repositories/notifications.js';
import type { SessionPayload } from '../types/index.js';

const notifications = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/notifications
notifications.get('/', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const list = await notificationRepo.findByUserId(session.uid);
  const unread = await notificationRepo.countUnread(session.uid);
  return c.json({ notifications: list, unreadCount: unread });
});

// POST /api/v1/notifications/:id/read
notifications.post('/:id/read', async (c) => {
  await notificationRepo.markRead(c.req.param('id'));
  return c.json({ success: true });
});

// POST /api/v1/notifications/read-all
notifications.post('/read-all', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  await notificationRepo.markAllRead(session.uid);
  return c.json({ success: true });
});

export { notifications };
