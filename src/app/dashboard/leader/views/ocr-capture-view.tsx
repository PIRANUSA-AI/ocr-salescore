'use client';

import { useDashboard } from '@/app/dashboard/dashboard-context';
import { OcrCaptureView } from '../components/ocr-capture-view';

/**
 * Leader/Sales wrapper for the mobile-first OCR capture flow.
 * Pulls all customers from the dashboard context (same data as Customer Manager)
 * to show the "Hasil Terbaru" section under the capture card.
 */
export default function OcrCaptureViewWrapper() {
  const { customers } = useDashboard();

  // All customers, newest first (same data source as Customer Manager).
  const recentCustomers = customers
    .slice()
    .sort((a, b) => {
      const getTime = (c: any) => {
        const raw = c.createdAt || c.updatedAt;
        if (!raw) return 0;
        if (typeof raw === 'object' && raw.seconds) return raw.seconds * 1000;
        return new Date(raw).getTime() || 0;
      };
      return getTime(b) - getTime(a);
    });

  return <OcrCaptureView recentCustomers={recentCustomers} />;
}
