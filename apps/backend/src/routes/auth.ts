import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { userRepo } from '../repositories/users.js';
import { setSessionCookie, clearSessionCookie } from '../middleware/session.js';
import type { SessionPayload } from '../types/index.js';

const auth = new Hono<{ Variables: { session: SessionPayload | null } }>();

// POST /api/v1/auth/login
auth.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  const user = await userRepo.findByEmail(email);
  if (!user) {
    return c.json({ error: 'Email atau kata sandi tidak valid.' }, 401);
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    return c.json({ error: 'Email atau kata sandi tidak valid.' }, 401);
  }

  const payload: SessionPayload = {
    uid: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    team: user.team,
    photoURL: user.photo_url ?? undefined,
    salesCode: user.sales_code,
  };

  setSessionCookie(c, payload);
  return c.json({ profile: payload });
});

// POST /api/v1/auth/signup
auth.post('/signup', async (c) => {
  const { name, email, password, role, team } = await c.req.json<{
    name: string; email: string; password: string;
    role: 'Leader' | 'Sales' | 'Superadmin'; team: 'AEC' | 'MFG';
  }>();

  const existing = await userRepo.findByEmail(email);
  if (existing) {
    return c.json({ error: 'Email ini sudah terdaftar.' }, 409);
  }

  const id = `${role.toLowerCase()}-${Date.now().toString(36)}`;
  const hash = await bcrypt.hash(password, 10);
  const profile = await userRepo.create({ id, name, email, passwordHash: hash, role, team });

  const payload: SessionPayload = {
    uid: profile.uid,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    team: profile.team,
  };

  setSessionCookie(c, payload);
  return c.json({ profile: payload }, 201);
});

// POST /api/v1/auth/logout
auth.post('/logout', (c) => {
  clearSessionCookie(c);
  return c.json({ success: true });
});

// GET /api/v1/auth/me
auth.get('/me', (c) => {
  const session: SessionPayload | null = c.get('session');
  return c.json({ profile: session });
});

// PUT /api/v1/auth/profile
auth.put('/profile', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { name, photoURL } = await c.req.json<{ name?: string; photoURL?: string }>();
  if (name !== undefined) await userRepo.update(session.uid, { name });
  if (photoURL !== undefined) await userRepo.update(session.uid, { photo_url: photoURL });
  return c.json({ success: true });
});

// PUT /api/v1/auth/password
auth.put('/password', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { currentPassword, password } = await c.req.json<{ currentPassword: string; password: string }>();
  if (!currentPassword || !password) {
    return c.json({ error: 'Password saat ini dan password baru wajib diisi.' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: 'Password baru minimal 6 karakter.' }, 400);
  }

  const currentHash = await userRepo.findPasswordHash(session.uid);
  if (!currentHash) return c.json({ error: 'Unauthorized' }, 401);

  const ok = await bcrypt.compare(currentPassword, currentHash);
  if (!ok) return c.json({ error: 'Password saat ini salah.' }, 401);

  const hash = await bcrypt.hash(password, 10);
  await userRepo.updatePassword(session.uid, hash);
  return c.json({ success: true });
});

export { auth };
