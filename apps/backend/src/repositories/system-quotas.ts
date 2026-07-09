import { query } from '../db/pool.js';

type QuotaRow = {
  id: string;
  daily_used: number;
  monthly_used: number;
  last_reset_date: string;
};

export const systemQuotaRepo = {
  async get(id: string): Promise<{ dailyUsed: number; monthlyUsed: number; lastResetDate: string }> {
    const rows = await query<QuotaRow>(
      `INSERT INTO system_quotas (id, daily_used, monthly_used)
       VALUES ($1, 0, 0)
       ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id
       RETURNING *`,
      [id],
    );
    const r = rows.rows[0];
    return { dailyUsed: r.daily_used, monthlyUsed: r.monthly_used, lastResetDate: r.last_reset_date };
  },

  async increment(id: string): Promise<void> {
    await query(
      `UPDATE system_quotas SET
        daily_used = daily_used + 1,
        monthly_used = monthly_used + 1
       WHERE id = $1`,
      [id],
    );
  },

  async resetDaily(): Promise<void> {
    await query(
      `UPDATE system_quotas SET daily_used = 0, last_reset_date = CURRENT_DATE
       WHERE last_reset_date < CURRENT_DATE`,
    );
  },
};
