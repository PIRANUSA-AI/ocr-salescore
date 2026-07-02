/**
 * @fileOverview Server actions for logging user activities.
 */
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const LogActivitySchema = z.object({
  actorId: z.string(),
  actorName: z.string(),
  action: z.string(),
  targetId: z.string(),
  targetName: z.string(),
});

type LogActivityInput = z.infer<typeof LogActivitySchema>;

/**
 * Logs a specific user activity to the 'activityLogs' collection in Firestore.
 */
export async function logActivity(input: LogActivityInput): Promise<{ success: boolean }> {
  console.log(`[Action: logActivity] Logging action by ${input.actorName}: "${input.action}"`);
  const validation = LogActivitySchema.safeParse(input);
  if (!validation.success) {
    console.error('[Action: logActivity] Invalid input:', validation.error);
    return { success: false };
  }

  try {
    const logData = {
      ...validation.data,
      createdAt: Timestamp.now(),
    };
    await adminDb.collection('activityLogs').add(logData);
    console.log(`[Action: logActivity] >>> SUKSES! Aktivitas berhasil dicatat.`);
    return { success: true };
  } catch (error) {
    console.error('[Action: logActivity] !!! ERROR !!!', error);
    return { success: false };
  }
}

/**
 * Fetches the most recent activities.
 */
export async function getActivityLogs(limit: number = 20) {
    console.log(`[Action: getActivityLogs] Fetching last ${limit} activities.`);
    try {
        const snapshot = await adminDb.collection('activityLogs').orderBy('createdAt', 'desc').limit(limit).get();
        if (snapshot.empty) {
            return [];
        }
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
            };
        });
    } catch (error) {
        console.error('[Action: getActivityLogs] !!! ERROR !!!', error);
        throw new Error('Gagal mengambil log aktivitas.');
    }
}
