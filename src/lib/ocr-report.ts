/**
 * @fileOverview Pure (non-server-action) aggregation for the OCR report.
 * Kept separate from src/app/actions/report.ts so the client can recompute
 * stats on filter change without re-fetching from Firestore.
 */
import type { Customer } from '@/types';
import { PIPELINE_STAGES } from '@/types';
import { toZonedTime } from 'date-fns-tz';
import { startOfDay, endOfDay, subDays } from 'date-fns';

export type OcrTimeRange = 'today' | '7d' | '30d' | 'all';
export type OcrTeamFilter = 'AEC' | 'MFG' | 'all';

export interface OcrSalesRow {
  salesId: string | null;
  salesName: string;
  total: number;
  activeToday: number;
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
    activeToday: number;
    unassigned: number;
    won: number;
    conversionRate: number;
  };
  perSales: OcrSalesRow[];
  funnel: OcrFunnelStage[];
  quality: OcrQualityReport;
}

const timeZone = 'Asia/Jakarta';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Computes OcrReportData from an already-fetched, role-scoped customer list.
 * Pure function: no I/O, safe to call on every filter change on the client.
 */
export function computeOcrReport(
  customers: Customer[],
  range: OcrTimeRange = '30d',
  team: OcrTeamFilter = 'all'
): OcrReportData {
  let ocrCustomers = team === 'all' ? customers : customers.filter((c) => c.team === team);

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
      const touched = toDateSafe(c.updatedAt ?? c.createdAt);
      if (!touched) return false;
      const touchedJakarta = toZonedTime(touched, timeZone);
      return touchedJakarta >= rangeStart! && touchedJakarta <= rangeEnd;
    });
  }

  const totalOcr = ocrCustomers.length;
  const newToday = ocrCustomers.filter((c) => {
    const created = toDateSafe(c.createdAt);
    if (!created) return false;
    const createdJakarta = toZonedTime(created, timeZone);
    return createdJakarta >= startToday && createdJakarta <= endToday;
  }).length;
  const activeToday = ocrCustomers.filter((c) => {
    const touched = toDateSafe(c.updatedAt ?? c.createdAt);
    if (!touched) return false;
    const touchedJakarta = toZonedTime(touched, timeZone);
    return touchedJakarta >= startToday && touchedJakarta <= endToday;
  }).length;
  const unassigned = ocrCustomers.filter((c) => !c.assignedSalesId).length;
  const won = ocrCustomers.filter((c) => c.pipelineStatus === 'Won').length;
  const conversionRate = totalOcr > 0 ? (won / totalOcr) * 100 : 0;

  const dist: Record<
    string,
    { salesName: string; total: number; activeToday: number; won: number; potentialRevenue: number }
  > = {};

  ocrCustomers.forEach((c) => {
    const id = c.assignedSalesId || 'unassigned';
    const name = c.assignedSalesName || 'Belum Ditugaskan';
    if (!dist[id]) {
      dist[id] = { salesName: name, total: 0, activeToday: 0, won: 0, potentialRevenue: 0 };
    }
    dist[id].total++;
    const touched = toDateSafe(c.updatedAt ?? c.createdAt);
    if (touched) {
      const tj = toZonedTime(touched, timeZone);
      if (tj >= startToday && tj <= endToday) dist[id].activeToday++;
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
      activeToday: d.activeToday,
      won: d.won,
      conversionRate: d.total > 0 ? (d.won / d.total) * 100 : 0,
      potentialRevenue: d.potentialRevenue,
    }))
    .sort((a, b) => {
      if (a.salesId === null) return 1;
      if (b.salesId === null) return -1;
      return b.total - a.total;
    });

  const funnel: OcrFunnelStage[] = PIPELINE_STAGES.map((status) => ({
    status,
    count: ocrCustomers.filter((c) => c.pipelineStatus === status).length,
  }));

  const noEmail = ocrCustomers.filter((c) => !c.email || c.email.trim() === '').length;
  const noPhone = ocrCustomers.filter((c) => !c.phone || c.phone.trim() === '').length;
  const invalidEmail = ocrCustomers.filter((c) => {
    if (!c.email || c.email.trim() === '') return false;
    return !EMAIL_REGEX.test(c.email);
  }).length;

  return {
    stats: { totalOcr, newToday, activeToday, unassigned, won, conversionRate },
    perSales,
    funnel,
    quality: { total: totalOcr, noEmail, noPhone, invalidEmail },
  };
}
