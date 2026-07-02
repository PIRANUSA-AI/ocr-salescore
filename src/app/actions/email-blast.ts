'use server';

import { adminDb as db } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface EmailBlastHistory {
    id: string;
    subject: string;
    recipientCount: number;
    recipients: string[];
    emailType: string;
    sentAt: Date;
    sentBy: string;
    contentSnippet: string;
    content: string;
    clickCount?: number;
}

export async function saveEmailBlastHistory(data: {
    id?: string; // Optional ID
    subject: string;
    content: string;
    recipientCount: number;
    recipients: string[];
    emailType: string;
    userEmail: string;
}) {
    try {
        const blastData = {
            subject: data.subject,
            content: data.content,
            recipientCount: data.recipientCount,
            recipients: data.recipients,
            emailType: data.emailType,
            sentBy: data.userEmail,
            sentAt: FieldValue.serverTimestamp(),
            clickCount: 0 // Initialize
        };

        if (data.id) {
            await db.collection('email_blasts').doc(data.id).set(blastData, { merge: true });
        } else {
            await db.collection('email_blasts').add(blastData);
        }
        return { success: true };
    } catch (error) {
        console.error("Error saving email blast history:", error);
        return { success: false, error: (error as Error).message };
    }
}

export async function getEmailBlastHistory(userEmail?: string): Promise<EmailBlastHistory[]> {
    try {
        const snapshot = await db.collection('email_blasts')
            .orderBy('sentAt', 'desc')
            .get();

        return snapshot.docs.map(doc => {
            const data = doc.data();
            let sentAtDate = new Date();

            // Handle Timestamp to Date conversion for Admin SDK
            if (data.sentAt && typeof data.sentAt.toDate === 'function') {
                sentAtDate = data.sentAt.toDate();
            } else if (data.sentAt instanceof Date) {
                sentAtDate = data.sentAt;
            }

            return {
                id: doc.id,
                subject: data.subject,
                recipientCount: data.recipientCount,
                recipients: data.recipients || [],
                emailType: data.emailType,
                sentAt: sentAtDate,
                sentBy: data.sentBy,
                contentSnippet: data.content ? data.content.substring(0, 100) + '...' : '',
                content: data.content || '',
                clickCount: data.clickCount || 0
            };
        });
    } catch (error) {
        console.error("Error fetching email blast history:", error);
        return [];
    }
}
