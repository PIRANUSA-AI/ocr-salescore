
'use server';

import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { UserProfile } from '@/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logActivity } from './activity';
import { createNotification } from './notification';
import { revalidateTag } from 'next/cache';
import { USERS_CACHE_TAG } from '@/lib/cache-tags';

const leaderSignupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  team: z.enum(['AEC', 'MFG']),
  specialKey: z.string().refine(val => val === "LeadPira", { message: "Kunci khusus tidak valid." }),
  role: z.literal('Leader'),
});

const salesSignupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  team: z.enum(['AEC', 'MFG']),
  role: z.literal('Sales'),
});

const superadminSignupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  team: z.enum(['AEC', 'MFG']),
  specialKey: z.string().refine(val => val === "SuperPira", { message: "Kunci khusus tidak valid." }),
  role: z.literal('Superadmin'),
});

const signupSchema = z.union([leaderSignupSchema, salesSignupSchema, superadminSignupSchema]);


export async function handleSignupAction(formData: z.infer<typeof signupSchema>): Promise<{ success: boolean; error: string | null }> {
  const validation = signupSchema.safeParse(formData);
  if (!validation.success) {
    return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
  }

  const { name, email, password, role, team } = validation.data;

  try {
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    });

    const userProfile: UserProfile = {
      uid: userRecord.uid,
      name,
      email,
      role,
      team,
    };

    await adminDb.collection('users').doc(userRecord.uid).set(userProfile);

    // Log Activity
    await logActivity({
      actorId: userRecord.uid,
      actorName: name,
      action: 'mendaftar akun baru',
      targetId: userRecord.uid,
      targetName: 'System',
    });

    console.log(`[Action: handleSignupAction] Pengguna baru berhasil dibuat: ${userRecord.uid} dengan peran ${role}`);
    revalidateTag(USERS_CACHE_TAG);
    return { success: true, error: null };

  } catch (error: any) {
    console.error('[Action: handleSignupAction] Gagal membuat pengguna:', error);
    let errorMessage = 'Terjadi kesalahan tidak terduga.';
    if (error.code === 'auth/email-already-exists') {
      errorMessage = 'Email ini sudah terdaftar. Silakan masuk.';
    } else if (error.code === 'permission-denied') {
      errorMessage = 'Gagal menyimpan profil pengguna. Anda mungkin tidak memiliki izin untuk membuat akun ini.';
    }
    return { success: false, error: errorMessage };
  }
}
