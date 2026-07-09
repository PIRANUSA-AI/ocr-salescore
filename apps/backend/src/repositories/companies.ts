import { query } from '../db/pool.js';
import type { CompanyProfile } from '../types/index.js';

type CompanyRow = {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  employee_count: string | null;
  address: string | null;
  tech_stack: any;
  potential_tier: string;
  key_projects: any;
  last_analysis_date: string | null;
  summary: string;
  risk_assessment: string | null;
  created_at: string;
  updated_at: string;
};

function rowToCompany(row: CompanyRow): CompanyProfile {
  return {
    id: row.id,
    name: row.name,
    website: row.website ?? undefined,
    industry: row.industry ?? undefined,
    employeeCount: row.employee_count ?? undefined,
    address: row.address ?? undefined,
    techStack: row.tech_stack ?? [],
    potentialTier: row.potential_tier as CompanyProfile['potentialTier'],
    keyProjects: row.key_projects ?? [],
    lastAnalysisDate: row.last_analysis_date ?? '',
    summary: row.summary,
    riskAssessment: row.risk_assessment ?? undefined,
  };
}

export const companyRepo = {
  async findById(id: string): Promise<CompanyProfile | null> {
    const rows = await query<CompanyRow>('SELECT * FROM companies WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0] ? rowToCompany(rows.rows[0]) : null;
  },

  async upsert(data: CompanyProfile): Promise<CompanyProfile> {
    const rows = await query<CompanyRow>(
      `INSERT INTO companies (id, name, website, industry, employee_count, address,
        tech_stack, potential_tier, key_projects, last_analysis_date, summary, risk_assessment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name, website = EXCLUDED.website, industry = EXCLUDED.industry,
        employee_count = EXCLUDED.employee_count, address = EXCLUDED.address,
        tech_stack = EXCLUDED.tech_stack, potential_tier = EXCLUDED.potential_tier,
        key_projects = EXCLUDED.key_projects,
        last_analysis_date = EXCLUDED.last_analysis_date,
        summary = EXCLUDED.summary, risk_assessment = EXCLUDED.risk_assessment,
        updated_at = NOW()
       RETURNING *`,
      [
        data.id, data.name, data.website || null, data.industry || null,
        data.employeeCount || null, data.address || null,
        JSON.stringify(data.techStack || []), data.potentialTier,
        JSON.stringify(data.keyProjects || []),
        data.lastAnalysisDate || null, data.summary, data.riskAssessment || null,
      ],
    );
    return rowToCompany(rows.rows[0]);
  },
};
