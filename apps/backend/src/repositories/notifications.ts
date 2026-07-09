import { query } from '../db/pool.js';
import type { Notification } from '../types/index.js';

type NotificationRow = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  link: string | null;
  related_id: string | null;
  created_at: string;
};

function rowToNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type as Notification['type'],
    isRead: row.is_read,
    link: row.link ?? undefined,
    relatedId: row.related_id ?? undefined,
    createdAt: row.created_at,
  };
}

export const notificationRepo = {
  async create(data: Omit<Notification, 'id' | 'isRead' | 'createdAt'>): Promise<Notification> {
    const rows = await query<NotificationRow>(
      `INSERT INTO notifications (user_id, title, message, type, link, related_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.userId, data.title, data.message, data.type, data.link || null, data.relatedId || null],
    );
    return rowToNotification(rows.rows[0]);
  },

  async findByUserId(userId: string): Promise<Notification[]> {
    const rows = await query<NotificationRow>(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId],
    );
    return rows.rows.map(rowToNotification);
  },

  async markRead(id: string): Promise<void> {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [id]);
  },

  async markAllRead(userId: string): Promise<void> {
    await query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE', [userId]);
  },

  async countUnread(userId: string): Promise<number> {
    const rows = await query<{ count: number }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
      [userId],
    );
    return Number(rows.rows[0].count);
  },
};
