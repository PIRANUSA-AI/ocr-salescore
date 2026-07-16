import { query } from '../db/pool.js';
import type { Customer } from '../types/index.js';

type CustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  job_title: string;
  team: 'AEC' | 'MFG';
  address: string | null;
  pipeline_status: string;
  assigned_sales_id: string | null;
  assigned_sales_name: string | null;
  potential_revenue: number | null;
  acquisition_context: any;
  products: any;
  form_answers: any;
  webinar_history: any;
  notes: any;
  generation_history: any;
  image_url: string | null;
  image_key: string | null;
  created_at: string;
  updated_at: string;
};

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    jobTitle: row.job_title,
    team: row.team,
    address: row.address ?? undefined,
    pipelineStatus: row.pipeline_status as Customer['pipelineStatus'],
    assignedSalesId: row.assigned_sales_id,
    assignedSalesName: row.assigned_sales_name,
    potentialRevenue: row.potential_revenue ?? undefined,
    acquisitionContext: row.acquisition_context ?? { source: 'Lainnya', eventName: 'Tidak Diketahui', eventDate: row.created_at },
    products: row.products ?? [],
    formAnswers: row.form_answers ?? [],
    webinarHistory: row.webinar_history ?? [],
    notes: row.notes ?? {},
    generationHistory: row.generation_history ?? [],
    imageUrl: row.image_url ?? undefined,
    imageKey: row.image_key ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const customerRepo = {
  async findAll(filters?: { assignedSalesId?: string; team?: 'AEC' | 'MFG'; teams?: ('AEC' | 'MFG')[]; event?: string; eventDate?: string; from?: string; to?: string }): Promise<Customer[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (filters?.assignedSalesId) {
      conditions.push(`assigned_sales_id = $${idx++}`);
      values.push(filters.assignedSalesId);
    }
    if (filters?.teams && filters.teams.length > 0) {
      conditions.push(`team = ANY($${idx++})`);
      values.push(filters.teams);
    } else if (filters?.team) {
      conditions.push(`team = $${idx++}`);
      values.push(filters.team);
    }
    if (filters?.event) {
      conditions.push(`acquisition_context->>'eventName' = $${idx++}`);
      values.push(filters.event);
    }
    if (filters?.eventDate) {
      conditions.push(`DATE(acquisition_context->>'eventDate') = $${idx++}::date`);
      values.push(filters.eventDate);
    }
    if (filters?.from) {
      conditions.push(`created_at >= $${idx++}::timestamp`);
      values.push(filters.from);
    }
    if (filters?.to) {
      conditions.push(`created_at <= ($${idx++}::timestamp + interval '1 day' - interval '1 second')`);
      values.push(filters.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query<CustomerRow>(
      `SELECT * FROM customers ${where} ORDER BY updated_at DESC`,
      values,
    );
    return rows.rows.map(rowToCustomer);
  },

  async findById(id: string): Promise<Customer | null> {
    const rows = await query<CustomerRow>('SELECT * FROM customers WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0] ? rowToCustomer(rows.rows[0]) : null;
  },

  async findByEmail(email: string): Promise<Customer | null> {
    const rows = await query<CustomerRow>('SELECT * FROM customers WHERE lower(email) = lower($1) LIMIT 1', [email]);
    return rows.rows[0] ? rowToCustomer(rows.rows[0]) : null;
  },

  async create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Customer> {
    const rows = await query<CustomerRow>(
      `INSERT INTO customers
        (id, name, email, phone, company, job_title, team, address,
         pipeline_status, assigned_sales_id, assigned_sales_name,
         potential_revenue, acquisition_context, products, form_answers,
         webinar_history, notes, generation_history, image_url, image_key)
       VALUES
        (COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
       RETURNING *`,
      [
        data.id || null,
        data.name, data.email, data.phone, data.company,
        data.jobTitle, data.team, data.address || null,
        data.pipelineStatus, data.assignedSalesId, data.assignedSalesName,
        data.potentialRevenue || null,
        JSON.stringify(data.acquisitionContext || {}),
        JSON.stringify(data.products || []),
        JSON.stringify(data.formAnswers || []),
        JSON.stringify(data.webinarHistory || []),
        JSON.stringify(data.notes || {}),
        JSON.stringify(data.generationHistory || []),
        data.imageUrl || null, data.imageKey || null,
      ],
    );
    return rowToCustomer(rows.rows[0]);
  },

  async update(id: string, fields: Partial<Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const fieldMap: Record<string, string> = {
      name: 'name', email: 'email', phone: 'phone', company: 'company',
      jobTitle: 'job_title', team: 'team', address: 'address',
      pipelineStatus: 'pipeline_status', assignedSalesId: 'assigned_sales_id',
      assignedSalesName: 'assigned_sales_name', potentialRevenue: 'potential_revenue',
      imageUrl: 'image_url', imageKey: 'image_key',
      acquisitionContext: 'acquisition_context', formAnswers: 'form_answers',
      webinarHistory: 'webinar_history', generationHistory: 'generation_history',
    };

    const jsonFields = new Set(['acquisitionContext', 'products', 'formAnswers', 'webinarHistory', 'notes', 'generationHistory']);

    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      const col = fieldMap[key] || key;
      if (jsonFields.has(key)) {
        setClauses.push(`${col} = $${idx++}`);
        values.push(JSON.stringify(value));
      } else {
        setClauses.push(`${col} = $${idx++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    await query(`UPDATE customers SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
  },

  async delete(id: string): Promise<void> {
    await query('DELETE FROM customers WHERE id = $1', [id]);
  },

  async findByCompany(company: string): Promise<Customer[]> {
    const rows = await query<CustomerRow>(
      'SELECT * FROM customers WHERE company = $1 ORDER BY updated_at DESC',
      [company],
    );
    return rows.rows.map(rowToCustomer);
  },

  async updateCompanyName(oldName: string, newName: string): Promise<number> {
    const result = await query(
      `UPDATE customers SET company = $1, updated_at = NOW() WHERE company = $2`,
      [newName, oldName],
    );
    return result.rowCount ?? 0;
  },

  async removeCompanyName(company: string): Promise<number> {
    const result = await query(
      `UPDATE customers SET company = NULL, updated_at = NOW() WHERE company = $1`,
      [company],
    );
    return result.rowCount ?? 0;
  },

  async searchByNameOrEmail(q: string): Promise<Pick<Customer, 'id' | 'name' | 'company'>[]> {
    const pattern = `%${q}%`;
    const rows = await query<{ id: string; name: string; company: string }>(
      `SELECT id, name, company FROM customers
       WHERE name ILIKE $1 OR email ILIKE $1
       ORDER BY name LIMIT 20`,
      [pattern],
    );
    return rows.rows.map(r => ({ id: r.id, name: r.name, company: r.company }));
  },

  async addFormAnswer(id: string, question: string, answer: string): Promise<void> {
    await query(
      `UPDATE customers SET form_answers = form_answers || $1::jsonb, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify([{ question, answer }]), id],
    );
  },

  async updateFormAnswer(id: string, questionKey: string, newAnswer: string): Promise<void> {
    await query(
      `UPDATE customers SET
        form_answers = (
          SELECT jsonb_agg(
            CASE WHEN item->>'question' = $2 THEN jsonb_set(item, '{answer}', to_jsonb($3::text))
            ELSE item END
          ) FROM jsonb_array_elements(form_answers) AS item
        ),
        updated_at = NOW()
       WHERE id = $1`,
      [id, questionKey, newAnswer],
    );
  },
};
