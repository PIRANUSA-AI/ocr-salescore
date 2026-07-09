'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Notification } from '@/types';

// Create a new notification
export async function createNotification(
    userId: string,
    title: string,
    message: string,
    type: Notification['type'] = 'info',
    link?: string,
    relatedId?: string
) {
    try {
        const notification: Omit<Notification, 'id'> = {
            userId,
            title,
            message,
            type,
            isRead: false,
            createdAt: new Date().toISOString(),
            link,
            relatedId
        };

        await adminDb.collection('notifications').add(notification);
        return { success: true };
    } catch (error) {
        console.error("Error creating notification:", error);
        return { success: false, error };
    }
}

export async function markNotificationAsRead(notificationId: string) {
    try {
        await adminDb.collection('notifications').doc(notificationId).update({
            isRead: true
        });
        return { success: true };
    } catch (error) {
        console.error("Error marking notification as read:", error);
        return { success: false, error };
    }
}

export async function markAllNotificationsAsRead(userId: string) {
    try {
        const snapshot = await adminDb.collection('notifications')
            .where('userId', '==', userId)
            .where('isRead', '==', false)
            .get();

        const batch = adminDb.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { isRead: true });
        });

        await batch.commit();
        return { success: true };
    } catch (error) {
        console.error("Error marking all notifications as read:", error);
        return { success: false, error };
    }
}
