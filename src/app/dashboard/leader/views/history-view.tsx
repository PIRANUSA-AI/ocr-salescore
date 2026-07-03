'use client';

import { useDashboard } from '../context/dashboard-context';
import { OcrHistoryView } from '../components/ocr-history-view';

/**
 * Leader/Sales wrapper for the OCR scan history page.
 */
export default function HistoryViewWrapper() {
  const { customers } = useDashboard();

  const ocrCustomers = customers
    .filter((c) => c.acquisitionContext?.source === 'OCR' || (c as any).source === 'OCR')
    .slice()
    .sort((a, b) => {
      const da = new Date((a as any).createdAt || (a as any).updatedAt || 0).getTime() || 0;
      const db = new Date((b as any).createdAt || (b as any).updatedAt || 0).getTime() || 0;
      return db - da;
    });

  return <OcrHistoryView customers={ocrCustomers} />;
}
