import { query } from '../db/pool.js';
import type { UserProfile } from '../types/index.js';

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: 'Leader' | 'Sales' | 'Superadmin';
  team: 'AEC' | 'MFG';
  photo_url: string | null;
  sales_code: string | null;
  leader_id: string | null;
  created_at: string;
  updated_at: string;
};

function rowToProfile(row: UserRow): UserProfile {
  return {
    uid: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    team: row.team,
    photoURL: row.photo_url ?? undefined,
    salesCode: row.sales_code,
  };
}

export const userRepo = {
  async findByEmail(email: string): Promise<(UserRow & { password_hash: string }) | null> {
    const rows = await query<UserRow>('SELECT * FROM users WHERE email = $1 LIMIT 1', [email.toLowerCase().trim()]);
    return rows.rows[0] || null;
  },

  async findById(id: string): Promise<UserProfile | null> {
    const rows = await query<UserRow>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0] ? rowToProfile(rows.rows[0]) : null;
  },

  async findPasswordHash(id: string): Promise<string | null> {
    const rows = await query<Pick<UserRow, 'password_hash'>>('SELECT password_hash FROM users WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0]?.password_hash ?? null;
  },

  async create(input: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: 'Leader' | 'Sales' | 'Superadmin';
    team: 'AEC' | 'MFG';
  }): Promise<UserProfile> {
    const rows = await query<UserRow>(
      `INSERT INTO users (id, name, email, password_hash, role, team)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [input.id, input.name, input.email.toLowerCase().trim(), input.passwordHash, input.role, input.team],
    );
    return rowToProfile(rows.rows[0]);
  },

  async update(id: string, fields: Partial<{ name: string; email: string; role: string; team: string; photo_url: string; sales_code: string; leader_id: string }>): Promise<void> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        setClauses.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) return;

    setClauses.push(`updated_at = NOW()`);
    values.push(id);
    await query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = $${idx}`, values);
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, id]);
  },

  async delete(id: string): Promise<void> {
    await query('DELETE FROM users WHERE id = $1', [id]);
  },

  async listByRole(role?: string, team?: string): Promise<UserProfile[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (role) {
      conditions.push(`role = $${idx++}`);
      values.push(role);
    }
    if (team) {
      conditions.push(`team = $${idx++}`);
      values.push(team);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await query<UserRow>(`SELECT * FROM users ${where} ORDER BY name`, values);
    return rows.rows.map(rowToProfile);
  },

  async listSales(team?: string): Promise<UserProfile[]> {
    const values: any[] = ['Sales'];
    let teamClause = '';
    if (team) {
      teamClause = ' AND team = $2';
      values.push(team);
    }
    const rows = await query<UserRow>(
      `SELECT * FROM users WHERE role = $1${teamClause} ORDER BY name`,
      values,
    );
    return rows.rows.map(rowToProfile);
  },
};
