import { Hono } from 'hono';
import { query } from '../db/pool.js';
import { PIPELINE_STAGES } from '../types/index.js';
import type { SessionPayload } from '../types/index.js';

const reports = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/reports/sales-ranking
reports.get('/sales-ranking', async (c) => {
  const team = c.req.query('team') as 'AEC' | 'MFG' | undefined;
  const where = team ? 'WHERE c.team = $1' : '';
  const params = team ? [team] : [];

  const rows = await query<{
    sales_id: string | null; sales_name: string; customer_count: number;
  }>(
    `SELECT
       c.assigned_sales_id AS sales_id,
       COALESCE(c.assigned_sales_name, 'Unassigned') AS sales_name,
       COUNT(*)::int AS customer_count
     FROM customers c
     ${where}
     GROUP BY c.assigned_sales_id, c.assigned_sales_name
     ORDER BY customer_count DESC`,
    params,
  );

  return c.json({ distribution: rows.rows });
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function jakartaDate(value: string | Date): Date {
  return new Date(new Date(value).toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
}

function startOfJakartaDay(date = new Date()): Date {
  const d = jakartaDate(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfJakartaDay(date = new Date()): Date {
  const d = jakartaDate(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

// GET /api/v1/reports/ocr
reports.get('/ocr', async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const range = (c.req.query('range') || '30d') as 'today' | '7d' | '30d' | 'all';
  const team = (c.req.query('team') || 'all') as 'AEC' | 'MFG' | 'all';

  const conditions = [`acquisition_context->>'source' = 'OCR'`];
  const params: any[] = [];
  let idx = 1;

  if (session.role === 'Leader') {
    conditions.push(`team = $${idx++}`);
    params.push(session.team);
  } else if (session.role === 'Sales') {
    conditions.push(`assigned_sales_id = $${idx++}`);
    params.push(session.uid);
  } else if (team !== 'all') {
    conditions.push(`team = $${idx++}`);
    params.push(team);
  }

  const rows = await query<{
    id: string;
    email: string | null;
    phone: string | null;
    pipeline_status: string;
    assigned_sales_id: string | null;
    assigned_sales_name: string | null;
    potential_revenue: number | null;
    created_at: string;
  }>(
    `SELECT id, email, phone, pipeline_status, assigned_sales_id, assigned_sales_name,
            potential_revenue, created_at
       FROM customers
      WHERE ${conditions.join(' AND ')}`,
    params,
  );

  let customers = rows.rows;
  const now = jakartaDate(new Date());
  const todayStart = startOfJakartaDay(now);
  const todayEnd = endOfJakartaDay(now);

  if (range !== 'all') {
    const rangeStart = startOfJakartaDay(now);
    if (range === '7d') rangeStart.setDate(rangeStart.getDate() - 7);
    if (range === '30d') rangeStart.setDate(rangeStart.getDate() - 30);
    customers = customers.filter((customer) => {
      const created = jakartaDate(customer.created_at);
      return created >= rangeStart && created <= (range === 'today' ? todayEnd : now);
    });
  }

  const totalOcr = customers.length;
  const newToday = customers.filter((customer) => {
    const created = jakartaDate(customer.created_at);
    return created >= todayStart && created <= todayEnd;
  }).length;
  const unassigned = customers.filter(cu => !cu.assigned_sales_id).length;
  const won = customers.filter(cu => cu.pipeline_status === 'Won').length;
  const conversionRate = totalOcr > 0 ? (won / totalOcr) * 100 : 0;

  const distribution: Record<string, { salesName: string; total: number; newToday: number; won: number; potentialRevenue: number }> = {};
  for (const customer of customers) {
    const id = customer.assigned_sales_id || 'unassigned';
    if (!distribution[id]) {
      distribution[id] = {
        salesName: customer.assigned_sales_name || 'Belum Ditugaskan',
        total: 0,
        newToday: 0,
        won: 0,
        potentialRevenue: 0,
      };
    }
    distribution[id].total++;
    const created = jakartaDate(customer.created_at);
    if (created >= todayStart && created <= todayEnd) distribution[id].newToday++;
    if (customer.pipeline_status === 'Won') distribution[id].won++;
    distribution[id].potentialRevenue += customer.potential_revenue || 0;
  }

  const perSales = Object.entries(distribution)
    .map(([id, data]) => ({
      salesId: id === 'unassigned' ? null : id,
      salesName: data.salesName,
      total: data.total,
      newToday: data.newToday,
      won: data.won,
      conversionRate: data.total > 0 ? (data.won / data.total) * 100 : 0,
      potentialRevenue: data.potentialRevenue,
    }))
    .sort((a, b) => {
      if (a.salesId === null) return 1;
      if (b.salesId === null) return -1;
      return b.total - a.total;
    });

  const funnel = PIPELINE_STAGES.map((status) => ({
    status,
    count: customers.filter(cu => cu.pipeline_status === status).length,
  }));

  const noEmail = customers.filter(cu => !cu.email?.trim()).length;
  const noPhone = customers.filter(cu => !cu.phone?.trim()).length;
  const invalidEmail = customers.filter(cu => cu.email?.trim() && !EMAIL_REGEX.test(cu.email)).length;

  return c.json({
    report: {
      stats: { totalOcr, newToday, unassigned, won, conversionRate },
      perSales,
      funnel,
      quality: { total: totalOcr, noEmail, noPhone, invalidEmail },
    },
  });
});

export { reports };
