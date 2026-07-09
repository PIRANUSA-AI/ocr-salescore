import { query } from '../db/pool.js';

type OcrJobRow = {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  image_url: string | null;
  result: any;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type OcrJob = {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  imageUrl: string | null;
  result: any;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

function rowToJob(row: OcrJobRow): OcrJob {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    imageUrl: row.image_url,
    result: row.result,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const ocrJobRepo = {
  async create(data: { userId: string; imageUrl?: string }): Promise<OcrJob> {
    const rows = await query<OcrJobRow>(
      `INSERT INTO ocr_jobs (user_id, image_url, status)
       VALUES ($1, $2, 'pending')
       RETURNING *`,
      [data.userId, data.imageUrl || null],
    );
    return rowToJob(rows.rows[0]);
  },

  async updateStatus(id: string, status: OcrJob['status'], extra?: { result?: any; errorMessage?: string; imageUrl?: string }): Promise<void> {
    const setClauses: string[] = ['status = $2', 'updated_at = NOW()'];
    const values: any[] = [id, status];
    let idx = 3;

    if (extra?.result !== undefined) {
      setClauses.push(`result = $${idx++}`);
      values.push(JSON.stringify(extra.result));
    }
    if (extra?.errorMessage !== undefined) {
      setClauses.push(`error_message = $${idx++}`);
      values.push(extra.errorMessage);
    }
    if (extra?.imageUrl !== undefined) {
      setClauses.push(`image_url = $${idx++}`);
      values.push(extra.imageUrl);
    }

    await query(
      `UPDATE ocr_jobs SET ${setClauses.join(', ')} WHERE id = $1`,
      values,
    );
  },

  async findByUserId(userId: string): Promise<OcrJob[]> {
    const rows = await query<OcrJobRow>(
      'SELECT * FROM ocr_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId],
    );
    return rows.rows.map(rowToJob);
  },

  async findRecentByUserId(userId: string, limit = 10): Promise<OcrJob[]> {
    const rows = await query<OcrJobRow>(
      'SELECT * FROM ocr_jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    );
    return rows.rows.map(rowToJob);
  },

  async findById(id: string): Promise<OcrJob | null> {
    const rows = await query<OcrJobRow>('SELECT * FROM ocr_jobs WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0] ? rowToJob(rows.rows[0]) : null;
  },
};
