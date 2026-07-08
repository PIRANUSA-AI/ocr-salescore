
/**
 * @fileOverview Server actions for generating report data.
 */
'use server';

import { getCustomers } from './customer';
import { getSalesUsers } from './user';
import { PIPELINE_STAGES } from '@/types';
import type { Customer, UserProfile, PipelineStatus } from '@/types';
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

export interface FunnelStage {
  status: PipelineStatus;
  count: number;
}

export interface LeadTrendPoint {
  name: string;
  count: number;
}

export interface ReportData {
  stats: {
    newCustomersToday: number;
    newCustomersYesterday: number;
    totalCustomers: number;
    totalCustomersLastMonth: number;
    totalRevenue: number;
    totalRevenueLastMonth: number;
    activeLeads: number;
    winRate: number;
    conversionRate: number;
    wonDealsToday: number;
  };
  leadTrend: LeadTrendPoint[];
  funnelBreakdown: FunnelStage[];
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
    const lostDeals = relevantCustomers.filter(
      (c) => c.pipelineStatus === 'Lost'
    );
    const closedDeals = wonDeals.length + lostDeals.length;

    const activeLeads = relevantCustomers.filter(
      (c) => c.pipelineStatus !== 'Won' && c.pipelineStatus !== 'Lost'
    ).length;

    const winRate =
      closedDeals > 0 ? (wonDeals.length / closedDeals) * 100 : 0;

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

    // 3. Lead Trend (6 bulan terakhir + bulan ini)
    const leadTrend: LeadTrendPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = subMonths(nowJakarta, i);
      const monthStart = startOfMonth(date);
      const monthEnd = endOfMonth(date);

      const monthCount = relevantCustomers.filter((c) => {
        const created = toDateSafe(c.createdAt);
        if (!created) return false;
        const createdJakarta = toZonedTime(created, timeZone);
        return createdJakarta >= monthStart && createdJakarta <= monthEnd;
      }).length;

      leadTrend.push({
        name: date.toLocaleString('default', { month: 'short' }),
        count: monthCount,
      });
    }

    // 3b. Revenue Trend (6 bulan terakhir + bulan ini)
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

    // 4. Funnel Breakdown (jumlah lead per pipeline stage, urut sesuai PIPELINE_STAGES)
    const funnelBreakdown: FunnelStage[] = PIPELINE_STAGES.map((status) => ({
      status,
      count: relevantCustomers.filter((c) => c.pipelineStatus === status).length,
    }));

    // 5. Sales Distribution
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
        activeLeads,
        winRate,
        conversionRate,
        wonDealsToday,
      },
      leadTrend,
      funnelBreakdown,
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
