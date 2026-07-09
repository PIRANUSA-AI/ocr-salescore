import { query } from '../db/pool.js';
import type { AnalysisHistoryEntry } from '../types/index.js';

type AnalysisRow = {
  id: string;
  webinar_title: string;
  webinar_date: string | null;
  unique_identifier: string | null;
  created_by: string | null;
  prospects: any;
  analysis: any;
  topics_generated: boolean;
  insights_generated: boolean;
  created_at: string;
  updated_at: string;
};

function rowToAnalysis(row: AnalysisRow): AnalysisHistoryEntry {
  return {
    id: row.id,
    webinarTitle: row.webinar_title,
    webinarDate: row.webinar_date || '',
    createdAt: row.created_at,
    prospects: row.prospects ?? [],
    analysis: row.analysis ?? {},
    topicsGenerated: row.topics_generated,
    insightsGenerated: row.insights_generated,
  };
}

export const analysisRepo = {
  async findByUniqueIdentifier(identifier: string): Promise<AnalysisHistoryEntry | null> {
    const rows = await query<AnalysisRow>(
      'SELECT * FROM analyses WHERE unique_identifier = $1 LIMIT 1',
      [identifier],
    );
    return rows.rows[0] ? rowToAnalysis(rows.rows[0]) : null;
  },

  async create(data: {
    webinarTitle: string;
    webinarDate?: string;
    uniqueIdentifier?: string;
    createdBy?: string;
    prospects?: any[];
    analysis?: any;
  }): Promise<AnalysisHistoryEntry> {
    const rows = await query<AnalysisRow>(
      `INSERT INTO analyses (webinar_title, webinar_date, unique_identifier, created_by, prospects, analysis)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.webinarTitle,
        data.webinarDate || null,
        data.uniqueIdentifier || null,
        data.createdBy || null,
        JSON.stringify(data.prospects || []),
        JSON.stringify(data.analysis || {}),
      ],
    );
    return rowToAnalysis(rows.rows[0]);
  },

  async findAll(): Promise<AnalysisHistoryEntry[]> {
    const rows = await query<AnalysisRow>('SELECT * FROM analyses ORDER BY created_at DESC');
    return rows.rows.map(rowToAnalysis);
  },

  async findById(id: string): Promise<AnalysisHistoryEntry | null> {
    const rows = await query<AnalysisRow>('SELECT * FROM analyses WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0] ? rowToAnalysis(rows.rows[0]) : null;
  },

  async update(id: string, fields: Partial<{ prospects: any[]; analysis: any; topicsGenerated: boolean; insightsGenerated: boolean }>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (fields.prospects !== undefined) {
      setClauses.push(`prospects = $${idx++}`);
      values.push(JSON.stringify(fields.prospects));
    }
    if (fields.analysis !== undefined) {
      setClauses.push(`analysis = $${idx++}`);
      values.push(JSON.stringify(fields.analysis));
    }
    if (fields.topicsGenerated !== undefined) {
      setClauses.push(`topics_generated = $${idx++}`);
      values.push(fields.topicsGenerated);
    }
    if (fields.insightsGenerated !== undefined) {
      setClauses.push(`insights_generated = $${idx++}`);
      values.push(fields.insightsGenerated);
    }

    if (setClauses.length === 0) return;
    setClauses.push('updated_at = NOW()');
    values.push(id);
    await query(`UPDATE analyses SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
  },

  async deleteByUniqueIdentifier(identifier: string): Promise<void> {
    await query('DELETE FROM analyses WHERE unique_identifier = $1', [identifier]);
  },
};
