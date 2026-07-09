
/**
 * @fileOverview Server actions for generating report data.
 */
'use server';

import { getCustomers } from './customer';
import { getSalesUsers } from './user';
import type { Customer, UserProfile } from '@/types';

export type { OcrTimeRange, OcrTeamFilter, OcrSalesRow, OcrFunnelStage, OcrQualityReport, OcrReportData } from '@/lib/ocr-report';

/**
 * Fetches OCR-sourced customers scoped to the requesting user's role/team.
 * Range and team-dropdown filtering happen client-side (see computeOcrReport
 * in src/lib/ocr-report.ts) so switching filters doesn't re-hit Firestore.
 */
export async function getOcrCustomers(user: UserProfile): Promise<Customer[]> {
  console.log(`[Action: getOcrCustomers] user=${user.name} (${user.role})`);
  try {
    const allCustomers = await getCustomers();
    let ocrCustomers = allCustomers.filter((c) => c.acquisitionContext?.source === 'OCR');

    if (user.role === 'Leader') {
      // Leader hanya lihat OCR leads tim-nya sendiri
      const salesTeam = await getSalesUsers();
      const teamSalesIds = salesTeam
        .filter((s) => s.team === user.team)
        .map((s) => s.uid);
      ocrCustomers = ocrCustomers.filter(
        (c) =>
          c.team === user.team ||
          (c.assignedSalesId ? teamSalesIds.includes(c.assignedSalesId) : false)
      );
    } else if (user.role === 'Sales') {
      // Safety: Sales hanya lihat miliknya (view Laporan memang untuk Leader/Superadmin)
      ocrCustomers = ocrCustomers.filter((c) => c.assignedSalesId === user.uid);
    }
    // Superadmin: no server-side team scoping needed, dropdown filters client-side.

    console.log(`[Action: getOcrCustomers] SUKSES. ${ocrCustomers.length} OCR customers.`);
    return ocrCustomers;
  } catch (error) {
    console.error('[Action: getOcrCustomers] !!! ERROR !!!', error);
    throw error;
  }
}
