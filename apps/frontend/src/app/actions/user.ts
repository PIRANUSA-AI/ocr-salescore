/**
 * @fileOverview Server actions for user management and retrieval.
 */
'use server';

import { adminDb } from '@/lib/firebase-admin';
import type { UserProfile } from '@/types';

/**
 * Mengambil semua pengguna Sales.
 */
export async function getSalesUsers(): Promise<UserProfile[]> {
    console.log(`[Action: getSalesUsers] Mengambil semua pengguna Sales.`);
    try {
        const usersRef = adminDb.collection('users');
        const q = usersRef.where('role', '==', 'Sales');
        const snapshot = await q.get();
        if (snapshot.empty) {
            console.log(`[Action: getSalesUsers] Tidak ditemukan user dengan peran 'Sales'.`);
            return [];
        }
        console.log(`[Action: getSalesUsers] SUKSES. Ditemukan ${snapshot.size} pengguna Sales.`);
        return snapshot.docs.map(doc => doc.data() as UserProfile);
    } catch (error) {
        console.error("[Action: getSalesUsers] !!! ERROR !!!", error);
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
        const usersRef = adminDb.collection('users');
        let q: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = usersRef.where('role', 'in', ['Sales', 'Leader']);

        if (team) {
            q = q.where('team', '==', team);
        }

        const snapshot = await q.get();
        if (snapshot.empty) {
            console.log(`[Action: getAssignableUsers] Tidak ditemukan pengguna yang cocok.`);
            return [];
        }
        console.log(`[Action: getAssignableUsers] SUKSES. Ditemukan ${snapshot.size} pengguna.`);
        return snapshot.docs.map(doc => doc.data() as UserProfile);
    } catch (error) {
        console.error("[Action: getAssignableUsers] !!! ERROR !!!", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Gagal mengambil daftar pengguna.");
    }
}
