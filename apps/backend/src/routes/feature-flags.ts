import { Hono } from 'hono';
import { featureFlagRepo } from '../repositories/feature-flags.js';
import type { SessionPayload } from '../types/index.js';

const featureFlags = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/feature-flags
featureFlags.get('/', async (c) => {
  const flags = await featureFlagRepo.findAll();
  return c.json({ featureFlags: flags });
});

// PATCH /api/v1/feature-flags/:id
featureFlags.patch('/:id', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (session?.role !== 'Superadmin') return c.json({ error: 'Forbidden' }, 403);

  const { isEnabled } = await c.req.json<{ isEnabled: boolean }>();
  await featureFlagRepo.update(c.req.param('id'), isEnabled);
  return c.json({ success: true });
});

export { featureFlags };
