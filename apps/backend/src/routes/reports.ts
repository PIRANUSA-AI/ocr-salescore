import { Hono } from 'hono';
import { query } from '../db/pool.js';
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

export { reports };
