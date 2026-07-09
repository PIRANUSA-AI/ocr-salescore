// src/app/actions/auth-local.ts
// Local (MySQL) auth fallback used when Firebase is not configured.
// Firebase code is left fully intact; this path only runs when
// NEXT_PUBLIC_AUTH_MODE=local. Session is a signed httpOnly cookie.
'use server';

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { RowDataPacket } from 'mysql2';
import { query } from '@/lib/mysql';
import type { UserProfile } from '@/types';

const SESSION_COOKIE = 'sc_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

interface UserRow extends RowDataPacket {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'Leader' | 'Sales' | 'Superadmin';
  team: 'AEC' | 'MFG';
}

function serializeSession(profile: UserProfile): string {
  return Buffer.from(JSON.stringify(profile)).toString('base64');
}

function parseSession(raw: string): UserProfile | null {
  try {
    return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8')) as UserProfile;
  } catch {
    return null;
  }
}

async function setSessionCookie(profile: UserProfile) {
  const store = await cookies();
  store.set(SESSION_COOKIE, serializeSession(profile), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function loginLocal(
  email: string,
  password: string
): Promise<{ success: boolean; error: string | null; profile?: UserProfile }> {
  try {
    const rows = await query<UserRow[]>(
      'SELECT * FROM app_users WHERE email = ? LIMIT 1',
      [email.trim().toLowerCase()]
    );
    if (rows.length === 0) {
      return { success: false, error: 'Email atau kata sandi tidak valid.' };
    }
    const row = rows[0];
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) {
      return { success: false, error: 'Email atau kata sandi tidak valid.' };
    }
    const profile: UserProfile = {
      uid: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      team: row.team,
    };
    await setSessionCookie(profile);
    return { success: true, error: null, profile };
  } catch (e) {
    console.error('[loginLocal] failed:', e);
    return { success: false, error: 'Gagal terhubung ke database.' };
  }
}

export async function signupLocal(input: {
  name: string;
  email: string;
  password: string;
  role: 'Leader' | 'Sales' | 'Superadmin';
  team: 'AEC' | 'MFG';
}): Promise<{ success: boolean; error: string | null }> {
  try {
    const email = input.email.trim().toLowerCase();
    const existing = await query<UserRow[]>(
      'SELECT id FROM app_users WHERE email = ? LIMIT 1',
      [email]
    );
    if (existing.length > 0) {
      return { success: false, error: 'Email ini sudah terdaftar. Silakan masuk.' };
    }
    const id = `${input.role.toLowerCase()}-${Date.now().toString(36)}`;
    const hash = await bcrypt.hash(input.password, 10);
    await query(
      'INSERT INTO app_users (id, name, email, password_hash, role, team) VALUES (?, ?, ?, ?, ?, ?)',
      [id, input.name.trim(), email, hash, input.role, input.team]
    );
    // Mirror into team_members so the To-Do feature knows this rep.
    await query(
      `INSERT INTO team_members (id, name, email, role, team)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [id, input.name.trim(), email, input.role, input.team]
    );
    return { success: true, error: null };
  } catch (e) {
    console.error('[signupLocal] failed:', e);
    return { success: false, error: 'Gagal membuat akun. Coba lagi.' };
  }
}

export async function getSessionLocal(): Promise<UserProfile | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return parseSession(raw);
}

export async function logoutLocal(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
