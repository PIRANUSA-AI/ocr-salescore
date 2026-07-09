import { query } from '../db/pool.js';

type EmailBlastRow = {
  id: string;
  subject: string;
  content: string;
  recipient_filter: any;
  sent_count: number;
  click_count: number;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type EmailBlast = {
  id: string;
  subject: string;
  content: string;
  recipientFilter: Record<string, any>;
  sentCount: number;
  clickCount: number;
  status: 'draft' | 'sent';
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowToBlast(row: EmailBlastRow): EmailBlast {
  return {
    id: row.id,
    subject: row.subject,
    content: row.content,
    recipientFilter: row.recipient_filter ?? {},
    sentCount: row.sent_count,
    clickCount: row.click_count,
    status: row.status as 'draft' | 'sent',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const emailBlastRepo = {
  async create(data: { subject: string; content: string; recipientFilter?: Record<string, any>; createdBy: string }): Promise<EmailBlast> {
    const rows = await query<EmailBlastRow>(
      `INSERT INTO email_blasts (subject, content, recipient_filter, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [data.subject, data.content, JSON.stringify(data.recipientFilter || {}), data.createdBy],
    );
    return rowToBlast(rows.rows[0]);
  },

  async findAll(): Promise<EmailBlast[]> {
    const rows = await query<EmailBlastRow>('SELECT * FROM email_blasts ORDER BY created_at DESC');
    return rows.rows.map(rowToBlast);
  },

  async findById(id: string): Promise<EmailBlast | null> {
    const rows = await query<EmailBlastRow>('SELECT * FROM email_blasts WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0] ? rowToBlast(rows.rows[0]) : null;
  },

  async incrementClick(id: string): Promise<void> {
    await query('UPDATE email_blasts SET click_count = click_count + 1 WHERE id = $1', [id]);
  },
};
