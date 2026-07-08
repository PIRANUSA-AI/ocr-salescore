'use server';

import { adminDb } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { extractCustomerVision } from '@/ai/flows/extract-customer-vision';

export async function processOcrJob(jobId: string, imageDataUri: string) {
  const jobRef = adminDb.collection('ocr_jobs').doc(jobId);

  try {
    await jobRef.set({
      status: 'processing',
      updatedAt: Timestamp.now(),
    }, { merge: true });

    const result = await extractCustomerVision({ imageDataUri });

    if ('rejected' in result) {
      await jobRef.set({
        status: 'error',
        error: result.visibleSummary || result.message,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      return;
    }

    await jobRef.set({
      status: 'done',
      result: {
        name: result.name,
        company: result.company,
        jobTitle: result.jobTitle,
        division: result.division,
        phone: result.phone,
        email: result.email,
        softwareNeeds: result.softwareNeeds,
        address: result.address,
        formAnswers: result.formAnswers ?? [],
        imageUrl: result.imageUrl ?? '',
      },
      updatedAt: Timestamp.now(),
    }, { merge: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Gagal memproses OCR.';
    await jobRef.set({
      status: 'error',
      error: msg,
      updatedAt: Timestamp.now(),
    }, { merge: true });
  }
}
