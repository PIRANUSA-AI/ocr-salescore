import { Hono } from 'hono';
import { activityLogRepo } from '../repositories/activity-logs.js';
import type { SessionPayload } from '../types/index.js';

const activities = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/activities
activities.get('/', async (c) => {
  const limit = Number(c.req.query('limit') || '50');
  const list = await activityLogRepo.findRecent(Math.min(limit, 200));
  return c.json({ activities: list });
});

// POST /api/v1/activities
activities.post('/', async (c) => {
  const session: SessionPayload | null = c.get('session');
  const body = await c.req.json<{
    action: string; targetId: string; targetName: string;
  }>();

  const log = await activityLogRepo.create({
    actorId: session?.uid || 'system',
    actorName: session?.name || 'System',
    action: body.action,
    targetId: body.targetId,
    targetName: body.targetName,
  });

  return c.json({ activity: log }, 201);
});

export { activities };
