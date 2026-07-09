import { query } from '../db/pool.js';
import type { ActivityLog } from '../types/index.js';

type ActivityLogRow = {
  id: number;
  actor_id: string;
  actor_name: string;
  action: string;
  target_id: string;
  target_name: string;
  created_at: string;
};

export const activityLogRepo = {
  async create(data: Omit<ActivityLog, 'id' | 'createdAt'>): Promise<ActivityLog> {
    const rows = await query<ActivityLogRow>(
      `INSERT INTO activity_logs (actor_id, actor_name, action, target_id, target_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.actorId, data.actorName, data.action, data.targetId, data.targetName],
    );
    const r = rows.rows[0];
    return { id: String(r.id), actorId: r.actor_id, actorName: r.actor_name, action: r.action, targetId: r.target_id, targetName: r.target_name, createdAt: r.created_at };
  },

  async findRecent(limit = 50): Promise<ActivityLog[]> {
    const rows = await query<ActivityLogRow>(
      'SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT $1',
      [limit],
    );
    return rows.rows.map(r => ({ id: String(r.id), actorId: r.actor_id, actorName: r.actor_name, action: r.action, targetId: r.target_id, targetName: r.target_name, createdAt: r.created_at }));
  },
};
