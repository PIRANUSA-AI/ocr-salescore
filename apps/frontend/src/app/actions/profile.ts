'use server';

import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { revalidatePath } from 'next/cache';

const updateProfileSchema = z.object({
    uid: z.string(),
    name: z.string().min(1, "Nama tidak boleh kosong"),
    team: z.enum(['AEC', 'MFG']),
    photoURL: z.string().url().optional().or(z.literal('')),
});

const changePasswordSchema = z.object({
    uid: z.string(),
    newPassword: z.string().min(6, "Password minimal 6 karakter"),
});

export type ProfileUpdateState = {
    success: boolean;
    error?: string;
    message?: string;
};

export async function updateProfileAction(data: z.infer<typeof updateProfileSchema>): Promise<ProfileUpdateState> {
    const validation = updateProfileSchema.safeParse(data);

    if (!validation.success) {
        return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
    }

    const { uid, name, team, photoURL } = validation.data;

    try {
        // 1. Update Firestore User Document
        await adminDb.collection('users').doc(uid).update({
            name,
            team,
            ...(photoURL && { photoURL }), // Only update if provided
            updatedAt: new Date().toISOString()
        });

        // 2. Update Firebase Auth Profile (DisplayName and PhotoURL)
        await adminAuth.updateUser(uid, {
            displayName: name,
            ...(photoURL && { photoURL })
        });

        revalidatePath('/dashboard/profile');
        return { success: true, message: 'Profil berhasil diperbarui.' };

    } catch (error: any) {
        console.error('[Action: updateProfileAction] Error:', error);
        return { success: false, error: error.message || 'Gagal memperbarui profil.' };
    }
}

export async function changePasswordAction(data: z.infer<typeof changePasswordSchema>): Promise<ProfileUpdateState> {
    const validation = changePasswordSchema.safeParse(data);

    if (!validation.success) {
        return { success: false, error: validation.error.errors.map(e => e.message).join(', ') };
    }

    const { uid, newPassword } = validation.data;

    try {
        await adminAuth.updateUser(uid, {
            password: newPassword
        });

        return { success: true, message: 'Password berhasil diubah.' };

    } catch (error: any) {
        console.error('[Action: changePasswordAction] Error:', error);
        return { success: false, error: error.message || 'Gagal mengubah password.' };
    }
}
