'use server';

import { adminDb, adminAuth } from '@/lib/firebase-admin';
import type { FeatureFlag, UserProfile } from '@/types';

const defaultFlags: FeatureFlag[] = [
    { id: 'webinar', name: 'Tugas Webinar Baru', description: 'Tugas follow-up untuk prospek yang baru ikut webinar.', isEnabled: true },
    { id: 'renewal', name: 'Tugas Renewal', description: 'Tugas untuk mengingatkan pelanggan tentang lisensi yang akan berakhir.', isEnabled: true },
    { id: 'aftersales', name: 'Tugas Aftersales', description: 'Tugas follow-up 30 hari setelah pelanggan melakukan pembelian.', isEnabled: true },
    { id: 'update', name: 'Kampanye Update', description: 'Fitur untuk mencari pelanggan yang bisa ditawari versi produk terbaru.', isEnabled: true },
    { id: 'opportunity', name: 'Tugas Peluang (AI)', description: 'Tugas cross-sell/upsell yang dihasilkan oleh AI.', isEnabled: true }
];

/**
 * Gets all feature flags. If the collection doesn't exist, it initializes it with default values.
 */
export async function getFeatureFlags(): Promise<FeatureFlag[]> {
    console.log("[Action: getFeatureFlags] Fetching feature flags.");
    const flagsRef = adminDb.collection('featureFlags');
    const snapshot = await flagsRef.get();

    if (snapshot.empty) {
        console.log("[Action: getFeatureFlags] No flags found, initializing with defaults.");
        const batch = adminDb.batch();
        defaultFlags.forEach(flag => {
            const docRef = flagsRef.doc(flag.id);
            batch.set(docRef, flag);
        });
        await batch.commit();
        return defaultFlags;
    }

    const flags: FeatureFlag[] = [];
    snapshot.forEach(doc => {
        flags.push(doc.data() as FeatureFlag);
    });

    console.log(`[Action: getFeatureFlags] SUKSES. Ditemukan ${flags.length} feature flags.`);
    return flags;
}

/**
 * Updates the isEnabled status of a single feature flag.
 */
export async function updateFeatureFlag(flagId: string, isEnabled: boolean): Promise<{ success: boolean }> {
    console.log(`[Action: updateFeatureFlag] Updating flag ${flagId} to ${isEnabled}.`);
    try {
        const flagRef = adminDb.collection('featureFlags').doc(flagId);
        await flagRef.update({ isEnabled });
        console.log(`[Action: updateFeatureFlag] SUKSES.`);
        return { success: true };
    } catch (error) {
        console.error('[Action: updateFeatureFlag] !!! ERROR !!!', error);
        throw new Error('Gagal memperbarui status fitur.');
    }
}

// --- USER MANAGEMENT ACTIONS ---

export async function getUsers(): Promise<UserProfile[]> {
    console.log("[Action: getUsers] Fetching all users.");
    try {
        const snapshot = await adminDb.collection('users').get();
        const users: UserProfile[] = [];
        snapshot.forEach(doc => users.push(doc.data() as UserProfile));
        return users;
    } catch (error) {
        console.error("[Action: getUsers] Error fetching users:", error);
        throw new Error("Gagal mengambil daftar pengguna.");
    }
}

export type CreateUserInput = {
    email: string;
    password: string;
    name: string;
    role: 'Leader' | 'Sales' | 'Superadmin';
    team: 'AEC' | 'MFG';
};

export async function createUser(data: CreateUserInput): Promise<{ success: boolean; uid: string }> {
    console.log("[Action: createUser] Creating user:", data.email);
    try {
        // 1. Create in Firebase Auth
        const userRecord = await adminAuth.createUser({
            email: data.email,
            password: data.password,
            displayName: data.name,
        });

        // 2. Create Profile in Firestore
        const newUserProfile: UserProfile = {
            uid: userRecord.uid,
            name: data.name,
            email: data.email,
            role: data.role,
            team: data.team,
        };

        await adminDb.collection('users').doc(userRecord.uid).set(newUserProfile);

        console.log("[Action: createUser] SUCCESS. UID:", userRecord.uid);
        return { success: true, uid: userRecord.uid };
    } catch (error: any) {
        console.error("[Action: createUser] Error:", error);
        throw new Error(error.message || "Gagal membuat pengguna.");
    }
}

export type UpdateUserInput = {
    uid: string;
    name: string;
    role: 'Leader' | 'Sales' | 'Superadmin';
    team: 'AEC' | 'MFG';
};

export async function updateUser(data: UpdateUserInput): Promise<{ success: boolean }> {
    console.log("[Action: updateUser] Updating user:", data.uid);
    try {
        // 1. Update Firestore
        await adminDb.collection('users').doc(data.uid).update({
            name: data.name,
            role: data.role,
            team: data.team
        });

        // 2. Update Auth Display Name (Optional but good for consistency)
        await adminAuth.updateUser(data.uid, {
            displayName: data.name
        });

        console.log("[Action: updateUser] SUCCESS.");
        return { success: true };
    } catch (error: any) {
        console.error("[Action: updateUser] Error:", error);
        throw new Error("Gagal memperbarui pengguna.");
    }
}

export async function deleteUser(uid: string): Promise<{ success: boolean }> {
    console.log("[Action: deleteUser] Deleting user:", uid);
    try {
        // 1. Delete from Auth
        await adminAuth.deleteUser(uid);

        // 2. Delete from Firestore
        await adminDb.collection('users').doc(uid).delete();

        console.log("[Action: deleteUser] SUCCESS.");
        return { success: true };
    } catch (error: any) {
        console.error("[Action: deleteUser] Error:", error);
        throw new Error("Gagal menghapus pengguna.");
    }
}

export async function resetUserPassword(uid: string, newPassword: string): Promise<{ success: boolean }> {
    console.log("[Action: resetUserPassword] Resetting password for:", uid);
    try {
        await adminAuth.updateUser(uid, {
            password: newPassword
        });
        return { success: true };
    } catch (error) {
        console.error("[Action: resetUserPassword] Error:", error);
        throw new Error("Gagal reset password.");
    }
}
