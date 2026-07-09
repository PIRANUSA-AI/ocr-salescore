/**
 * @fileOverview Server actions for user management and retrieval.
 */
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { UserProfile } from '@/types';
import { isResourceExhausted, QUOTA_EXCEEDED_MESSAGE } from '@/lib/firestore-errors';
import { unstable_cache } from 'next/cache';
import { USERS_CACHE_TAG } from '@/lib/cache-tags';

/**
 * Raw fetch of the entire 'users' collection, cached for 60s.
 * getSalesUsers/getAssignableUsers filter this in-memory so they share one
 * cached read instead of issuing separate Firestore queries.
 * Invalidated immediately on user create/update/delete via revalidateTag(USERS_CACHE_TAG).
 */
const getAllUsersCached = unstable_cache(
    async (): Promise<UserProfile[]> => {
        console.log('[Action: user.ts] Fetching users from Firestore (cache miss).');
        const snapshot = await adminDb.collection('users').get();
        return snapshot.docs.map(doc => doc.data() as UserProfile);
    },
    ['all-users'],
    { tags: [USERS_CACHE_TAG], revalidate: 60 }
);

/**
 * Mengambil semua pengguna Sales.
 */
export async function getSalesUsers(): Promise<UserProfile[]> {
    console.log(`[Action: getSalesUsers] Mengambil semua pengguna Sales.`);
    try {
        const allUsers = await getAllUsersCached();
        const salesUsers = allUsers.filter(u => u.role === 'Sales');
        console.log(`[Action: getSalesUsers] SUKSES. Ditemukan ${salesUsers.length} pengguna Sales.`);
        return salesUsers;
    } catch (error) {
        console.error("[Action: getSalesUsers] !!! ERROR !!!", error);
        if (isResourceExhausted(error)) {
            throw new Error(QUOTA_EXCEEDED_MESSAGE);
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Gagal mengambil daftar sales.");
    }
}

/**
 * Mengambil semua pengguna yang dapat ditugaskan (Sales & Leader), dengan opsi filter berdasarkan tim.
 */
export async function getAssignableUsers(team?: 'AEC' | 'MFG'): Promise<UserProfile[]> {
    console.log(`[Action: getAssignableUsers] Mengambil pengguna Sales & Leader. Filter tim: ${team || 'Tidak ada'}`);
    try {
        const allUsers = await getAllUsersCached();
        const assignableUsers = allUsers.filter(u => {
            const roleMatch = u.role === 'Sales' || u.role === 'Leader';
            const teamMatch = !team || u.team === team;
            return roleMatch && teamMatch;
        });
        console.log(`[Action: getAssignableUsers] SUKSES. Ditemukan ${assignableUsers.length} pengguna.`);
        return assignableUsers;
    } catch (error) {
        console.error("[Action: getAssignableUsers] !!! ERROR !!!", error);
        if (isResourceExhausted(error)) {
            throw new Error(QUOTA_EXCEEDED_MESSAGE);
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Gagal mengambil daftar pengguna.");
    }
}
