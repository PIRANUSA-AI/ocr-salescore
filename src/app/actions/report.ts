
/**
 * @fileOverview Server actions for generating report data.
 */
'use server';

import { getCustomers } from './customer';
import { getSalesUsers } from './user';
import { PIPELINE_STAGES } from '@/types';
import type { UserProfile } from '@/types';
import { toZonedTime } from 'date-fns-tz';
import {
  startOfDay,
  endOfDay,
  subMonths,
  startOfMonth,
  endOfMonth,
  subDays,
} from 'date-fns';

export interface SalesDistribution {
  salesId: string | null;
  salesName: string;
  customerCount: number;
  pipelineBreakdown: Record<string, number>;
  totalRevenue: number;
}

export interface ReportData {
  stats: {
    newCustomersToday: number;
    newCustomersYesterday: number;
    totalCustomers: number;
    totalCustomersLastMonth: number;
    totalRevenue: number;
    totalRevenueLastMonth: number;
    conversionRate: number;
    wonDealsToday: number;
  };
  revenueTrend: { name: string; revenue: number }[];
  salesDistribution: SalesDistribution[];
}

const timeZone = 'Asia/Jakarta';

// helper kecil untuk handle Date / string / Firestore Timestamp
function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Firestore Timestamp punya method toDate()
  if (typeof value.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export async function getReportData(user: UserProfile): Promise<ReportData> {
  console.log(
    `[Action: getReportData] Generating report for ${user.name} (Role: ${user.role}, Team: ${user.team})`
  );

  try {
    // 1. Fetch customers based on user role
    const allCustomers = await getCustomers();
    let relevantCustomers = allCustomers;

    if (user.role === 'Leader') {
      const salesTeam = await getSalesUsers();
      const teamSalesIds = salesTeam
        .filter(s => s.team === user.team)
        .map(s => s.uid);

      relevantCustomers = allCustomers.filter((c) => {
        const isTeamMatch = c.team === user.team;
        const isAssignedToTeam = c.assignedSalesId && teamSalesIds.includes(c.assignedSalesId);
        return isTeamMatch || isAssignedToTeam;
      });
    } else if (user.role === 'Sales') {
      // Sales should see their own customers (handled by getCustomers? No, getCustomers returns all if valid)
      // Actually getCustomers returns all unless filtered. 
      // Logic for sales role in report might need to match DashboardContext too?
      // Assuming Sales only sees their own assigned customers for report:
      relevantCustomers = allCustomers.filter(c => c.assignedSalesId === user.uid);
    } else if (user.role !== 'Superadmin') {
      // Fallback for other roles or strictly team-based if needed
      relevantCustomers = allCustomers.filter((c) => c.team === user.team);
    }

    console.log(
      `[Action: getReportData] Found ${relevantCustomers.length} relevant customers.`
    );

    // 2. Time range dengan timezone Asia/Jakarta
    const now = new Date();
    const nowJakarta = toZonedTime(now, timeZone);

    const startToday = startOfDay(nowJakarta);
    const endToday = endOfDay(nowJakarta);

    const yesterdayJakarta = subDays(nowJakarta, 1);
    const startYesterday = startOfDay(yesterdayJakarta);
    const endYesterday = endOfDay(yesterdayJakarta);

    const startThisMonth = startOfMonth(nowJakarta);

    // --- Stats ---

    const newCustomersToday = relevantCustomers.filter((c) => {
      const created = toDateSafe(c.createdAt);
      if (!created) return false;
      const createdJakarta = toZonedTime(created, timeZone);
      return createdJakarta >= startToday && createdJakarta <= endToday;
    }).length;

    const newCustomersYesterday = relevantCustomers.filter((c) => {
      const created = toDateSafe(c.createdAt);
      if (!created) return false;
      const createdJakarta = toZonedTime(created, timeZone);
      return createdJakarta >= startYesterday && createdJakarta <= endYesterday;
    }).length;

    const totalCustomers = relevantCustomers.length;

    const totalCustomersLastMonth = relevantCustomers.filter((c) => {
      const created = toDateSafe(c.createdAt);
      if (!created) return false;
      const createdJakarta = toZonedTime(created, timeZone);
      return createdJakarta < startThisMonth;
    }).length;

    const wonDeals = relevantCustomers.filter(
      (c) => c.pipelineStatus === 'Won'
    );

    const totalRevenue = wonDeals.reduce(
      (acc, c) => acc + (c.potentialRevenue || 0),
      0
    );

    const totalRevenueLastMonth = wonDeals
      .filter((c) => {
        const updated = toDateSafe(c.updatedAt);
        if (!updated) return false;
        const updatedJakarta = toZonedTime(updated, timeZone);
        return updatedJakarta < startThisMonth;
      })
      .reduce((acc, c) => acc + (c.potentialRevenue || 0), 0);

    const wonDealsToday = wonDeals.filter((c) => {
      const updated = toDateSafe(c.updatedAt);
      if (!updated) return false;
      const updatedJakarta = toZonedTime(updated, timeZone);
      return updatedJakarta >= startToday && updatedJakarta <= endToday;
    }).length;

    const totalDeals = relevantCustomers.length;
    const conversionRate =
      totalDeals > 0 ? (wonDeals.length / totalDeals) * 100 : 0;

    // 3. Revenue Trend (6 bulan terakhir + bulan ini)
    const revenueTrend: { name: string; revenue: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = subMonths(nowJakarta, i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);

      const monthRevenue = wonDeals
        .filter((c) => {
          const updated = toDateSafe(c.updatedAt);
          if (!updated) return false;
          const updatedJakarta = toZonedTime(updated, timeZone);
          return updatedJakarta >= monthStart && updatedJakarta <= monthEnd;
        })
        .reduce((acc, c) => acc + (c.potentialRevenue || 0), 0);

      revenueTrend.push({
        name: date.toLocaleString('default', { month: 'short' }),
        revenue: monthRevenue,
      });
    }

    // 4. Sales Distribution
    const distribution: Record<string, { name: string; count: number; pipelineBreakdown: Record<string, number>; revenue: number }> = {};

    relevantCustomers.forEach((customer) => {
      const salesId = customer.assignedSalesId || 'unassigned';
      const salesName = customer.assignedSalesName || 'Belum Ditugaskan';

      if (!distribution[salesId]) {
        distribution[salesId] = { name: salesName, count: 0, pipelineBreakdown: {}, revenue: 0 };
      }
      distribution[salesId].count++;
      distribution[salesId].pipelineBreakdown[customer.pipelineStatus] =
        (distribution[salesId].pipelineBreakdown[customer.pipelineStatus] || 0) + 1;
      if (customer.pipelineStatus === 'Won') {
        distribution[salesId].revenue += customer.potentialRevenue || 0;
      }
    });

    const salesDistribution: SalesDistribution[] = Object.entries(
      distribution
    )
      .map(([salesId, data]) => ({
        salesId: salesId === 'unassigned' ? null : salesId,
        salesName: data.name,
        customerCount: data.count,
        pipelineBreakdown: data.pipelineBreakdown,
        totalRevenue: data.revenue,
      }))
      .sort((a, b) => b.customerCount - a.customerCount);

    const report: ReportData = {
      stats: {
        newCustomersToday,
        newCustomersYesterday,
        totalCustomers,
        totalCustomersLastMonth,
        totalRevenue,
        totalRevenueLastMonth,
        conversionRate,
        wonDealsToday,
      },
      revenueTrend,
      salesDistribution,
    };

    console.log(
      `[Action: getReportData] >>> SUKSES! Report generation complete.`
    );
    return report;
  } catch (error) {
    console.error('[Action: getReportData] !!! ERROR !!!', error);
    throw error;
  }
}

// ============ OCR REPORT ============

export type OcrTimeRange = 'today' | '7d' | '30d' | 'all';
export type OcrTeamFilter = 'AEC' | 'MFG' | 'all';

export interface OcrSalesRow {
  salesId: string | null;
  salesName: string;
  total: number;
  newToday: number;
  won: number;
  conversionRate: number;
  potentialRevenue: number;
}

export interface OcrFunnelStage {
  status: string;
  count: number;
}

export interface OcrQualityReport {
  total: number;
  noEmail: number;
  noPhone: number;
  invalidEmail: number;
}

export interface OcrReportData {
  stats: {
    totalOcr: number;
    newToday: number;
    unassigned: number;
    won: number;
    conversionRate: number;
  };
  perSales: OcrSalesRow[];
  funnel: OcrFunnelStage[];
  quality: OcrQualityReport;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getOcrReportData(
  user: UserProfile,
  range: OcrTimeRange = '30d',
  team: OcrTeamFilter = 'all'
): Promise<OcrReportData> {
  console.log(
    `[Action: getOcrReportData] range=${range}, team=${team}, user=${user.name} (${user.role})`
  );
  try {
    const allCustomers = await getCustomers();

    // 1. Filter OCR only
    let ocrCustomers = allCustomers.filter(
      (c) => c.acquisitionContext?.source === 'OCR'
    );

    // 2. Team scoping
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
    } else {
      // Superadmin: apply team filter
      if (team !== 'all') {
        ocrCustomers = ocrCustomers.filter((c) => c.team === team);
      }
    }

    // 3. Time range (createdAt, Jakarta tz)
    const now = new Date();
    const nowJakarta = toZonedTime(now, timeZone);
    const startToday = startOfDay(nowJakarta);
    const endToday = endOfDay(nowJakarta);

    let rangeStart: Date | null = null;
    if (range === 'today') rangeStart = startToday;
    else if (range === '7d') rangeStart = startOfDay(subDays(nowJakarta, 7));
    else if (range === '30d') rangeStart = startOfDay(subDays(nowJakarta, 30));

    if (rangeStart) {
      const rangeEnd = range === 'today' ? endToday : nowJakarta;
      ocrCustomers = ocrCustomers.filter((c) => {
        const created = toDateSafe(c.createdAt);
        if (!created) return false;
        const createdJakarta = toZonedTime(created, timeZone);
        return createdJakarta >= rangeStart! && createdJakarta <= rangeEnd;
      });
    }

    // 4. Stats
    const totalOcr = ocrCustomers.length;
    const newToday = ocrCustomers.filter((c) => {
      const created = toDateSafe(c.createdAt);
      if (!created) return false;
      const createdJakarta = toZonedTime(created, timeZone);
      return createdJakarta >= startToday && createdJakarta <= endToday;
    }).length;
    const unassigned = ocrCustomers.filter((c) => !c.assignedSalesId).length;
    const won = ocrCustomers.filter((c) => c.pipelineStatus === 'Won').length;
    const conversionRate = totalOcr > 0 ? (won / totalOcr) * 100 : 0;

    // 5. Per-sales aggregation
    const dist: Record<
      string,
      { salesName: string; total: number; newToday: number; won: number; potentialRevenue: number }
    > = {};

    ocrCustomers.forEach((c) => {
      const id = c.assignedSalesId || 'unassigned';
      const name = c.assignedSalesName || 'Belum Ditugaskan';
      if (!dist[id]) {
        dist[id] = { salesName: name, total: 0, newToday: 0, won: 0, potentialRevenue: 0 };
      }
      dist[id].total++;
      const created = toDateSafe(c.createdAt);
      if (created) {
        const cj = toZonedTime(created, timeZone);
        if (cj >= startToday && cj <= endToday) dist[id].newToday++;
      }
      if (c.pipelineStatus === 'Won') {
        dist[id].won++;
        dist[id].potentialRevenue += c.potentialRevenue || 0;
      }
    });

    const perSales: OcrSalesRow[] = Object.entries(dist)
      .map(([id, d]) => ({
        salesId: id === 'unassigned' ? null : id,
        salesName: d.salesName,
        total: d.total,
        newToday: d.newToday,
        won: d.won,
        conversionRate: d.total > 0 ? (d.won / d.total) * 100 : 0,
        potentialRevenue: d.potentialRevenue,
      }))
      .sort((a, b) => {
        // Unassigned selalu di paling bawah
        if (a.salesId === null) return 1;
        if (b.salesId === null) return -1;
        return b.total - a.total;
      });

    // 6. Funnel (per pipeline stage)
    const funnel: OcrFunnelStage[] = PIPELINE_STAGES.map((status) => ({
      status,
      count: ocrCustomers.filter((c) => c.pipelineStatus === status).length,
    }));

    // 7. Data quality
    const noEmail = ocrCustomers.filter(
      (c) => !c.email || c.email.trim() === ''
    ).length;
    const noPhone = ocrCustomers.filter(
      (c) => !c.phone || c.phone.trim() === ''
    ).length;
    const invalidEmail = ocrCustomers.filter((c) => {
      if (!c.email || c.email.trim() === '') return false;
      return !EMAIL_REGEX.test(c.email);
    }).length;

    const report: OcrReportData = {
      stats: { totalOcr, newToday, unassigned, won, conversionRate },
      perSales,
      funnel,
      quality: { total: totalOcr, noEmail, noPhone, invalidEmail },
    };

    console.log('[Action: getOcrReportData] >>> SUKSES!', {
      totalOcr, perSales: perSales.length,
    });
    return report;
  } catch (error) {
    console.error('[Action: getOcrReportData] !!! ERROR !!!', error);
    throw error;
  }
}
