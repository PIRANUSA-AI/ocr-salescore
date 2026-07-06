'use client';

import { useDashboard } from '@/app/dashboard/dashboard-context';
import { OcrCaptureView } from '../components/ocr-capture-view';

/**
 * Leader/Sales wrapper for the mobile-first OCR capture flow.
 * Pulls OCR-sourced customers from the dashboard context to show the
 * "Hasil Terbaru" section under the capture card.
 */
export default function OcrCaptureViewWrapper() {
  const { customers } = useDashboard();

  // Only customers captured via OCR, newest first.
  const ocrCustomers = customers
    .filter((c) => c.acquisitionContext?.source === 'OCR' || (c as any).source === 'OCR')
    .slice()
    .sort((a, b) => {
      const da = new Date((a as any).createdAt || (a as any).updatedAt || 0).getTime() || 0;
      const db = new Date((b as any).createdAt || (b as any).updatedAt || 0).getTime() || 0;
      return db - da;
    });

  return <OcrCaptureView recentCustomers={ocrCustomers} />;
}
