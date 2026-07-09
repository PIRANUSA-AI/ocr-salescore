import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { userRepo } from '../repositories/users.js';
import type { SessionPayload } from '../types/index.js';

const users = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/users/sales
users.get('/sales', async (c) => {
  const team = c.req.query('team') as 'AEC' | 'MFG' | undefined;
  const list = await userRepo.listSales(team);
  return c.json({ users: list });
});

// GET /api/v1/users — list with optional role/team filter
users.get('/', async (c) => {
  const role = c.req.query('role');
  const team = c.req.query('team') as 'AEC' | 'MFG' | undefined;
  const list = await userRepo.listByRole(role, team);
  return c.json({ users: list });
});

// GET /api/v1/users/:id
users.get('/:id', async (c) => {
  const profile = await userRepo.findById(c.req.param('id'));
  if (!profile) return c.json({ error: 'User not found' }, 404);
  return c.json({ user: profile });
});

// POST /api/v1/users — create by superadmin
users.post('/', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (session?.role !== 'Superadmin') return c.json({ error: 'Forbidden' }, 403);

  const { name, email, password, role, team } = await c.req.json<{
    name: string; email: string; password: string;
    role: 'Leader' | 'Sales' | 'Superadmin'; team: 'AEC' | 'MFG';
  }>();

  const existing = await userRepo.findByEmail(email);
  if (existing) return c.json({ error: 'Email already exists' }, 409);

  const id = `${role.toLowerCase()}-${Date.now().toString(36)}`;
  const hash = await bcrypt.hash(password, 10);
  const profile = await userRepo.create({ id, name, email, passwordHash: hash, role, team });
  return c.json({ user: profile }, 201);
});

// PATCH /api/v1/users/:id
users.patch('/:id', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (session?.role !== 'Superadmin') return c.json({ error: 'Forbidden' }, 403);

  const body = await c.req.json<{
    name?: string; email?: string; role?: string; team?: string;
  }>();

  await userRepo.update(c.req.param('id'), body);
  return c.json({ success: true });
});

// DELETE /api/v1/users/:id
users.delete('/:id', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (session?.role !== 'Superadmin') return c.json({ error: 'Forbidden' }, 403);

  await userRepo.delete(c.req.param('id'));
  return c.json({ success: true });
});

// PUT /api/v1/users/:id/password
users.put('/:id/password', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (session?.role !== 'Superadmin') return c.json({ error: 'Forbidden' }, 403);

  const { password } = await c.req.json<{ password: string }>();
  const hash = await bcrypt.hash(password, 10);
  await userRepo.updatePassword(c.req.param('id'), hash);
  return c.json({ success: true });
});

export { users };
