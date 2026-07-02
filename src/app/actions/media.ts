/**
 * @fileOverview Server actions for managing media assets.
 * Handles uploads, database records, and retrieval of media assets.
 */
'use server';

import { adminDb } from '@/lib/firebase-admin';
import { getStorage } from 'firebase-admin/storage';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { MediaAsset } from '@/types';

// Schema for creating a new media asset metadata document
const CreateMediaAssetSchema = z.object({
    id: z.string(),
    assetName: z.string().min(1, "Nama aset tidak boleh kosong."),
    fileName: z.string(),
    imageUrl: z.string().url(),
    tags: z.array(z.string()),
    uploadedBy: z.object({
        uid: z.string(),
        name: z.string(),
    }),
});

/**
 * Creates a metadata document in Firestore for a newly uploaded media asset.
 */
export async function createMediaAsset(input: z.infer<typeof CreateMediaAssetSchema>): Promise<{ success: boolean; error?: string }> {
    const validation = CreateMediaAssetSchema.safeParse(input);
    if (!validation.success) {
        return { success: false, error: validation.error.message };
    }
    try {
        const { id, ...data } = validation.data;
        const assetRef = adminDb.collection('mediaAssets').doc(id);
        await assetRef.set({
            ...data,
            createdAt: Timestamp.now(),
        });
        return { success: true };
    } catch (error) {
        console.error('[Action: createMediaAsset] Error:', error);
        return { success: false, error: 'Gagal menyimpan metadata aset.' };
    }
}

/**
 * Fetches all media assets from Firestore.
 */
export async function getMediaAssets(): Promise<MediaAsset[]> {
    try {
        const snapshot = await adminDb.collection('mediaAssets').orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            return [];
        }
        return snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: (data.createdAt as Timestamp).toDate().toISOString(),
            } as MediaAsset;
        });
    } catch (error) {
        console.error('[Action: getMediaAssets] Error:', error);
        throw new Error('Gagal mengambil data aset media.');
    }
}

/**
 * Deletes a media asset from both Firestore and Firebase Storage.
 */
export async function deleteMediaAsset(assetId: string, fileName: string): Promise<{ success: boolean; error?: string }> {
    if (!assetId || !fileName) {
        return { success: false, error: 'ID Aset dan nama file dibutuhkan.' };
    }

    try {
        // Delete the Firestore document
        const assetRef = adminDb.collection('mediaAssets').doc(assetId);
        await assetRef.delete();

        // Delete the file from Firebase Storage
        const bucket = getStorage().bucket('nextcast-554f2.appspot.com');
        const file = bucket.file(`images/${fileName}`);
        await file.delete();
        
        return { success: true };
    } catch (error) {
        console.error(`[Action: deleteMediaAsset] Error deleting asset ${assetId}:`, error);
        return { success: false, error: 'Gagal menghapus aset.' };
    }
}
