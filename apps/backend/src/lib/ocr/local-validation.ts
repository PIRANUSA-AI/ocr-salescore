import { resolveMx } from 'dns/promises';
import { cacheGet } from '../redis.js';
import type { OcrResult } from './types.js';

export type EmailLocalStatus =
  | 'empty'
  | 'invalid_syntax'
  | 'valid_syntax_mx_found'
  | 'valid_syntax_no_mx'
  | 'valid_syntax_mx_unchecked';

export type CompanyLocalStatus = 'empty' | 'present' | 'matches_email_domain' | 'differs_from_email_domain' | 'unchecked';

export interface OcrLocalValidation {
  email: {
    raw: string;
    normalized: string;
    status: EmailLocalStatus;
    syntaxValid: boolean;
    domain: string;
    mxFound: boolean | null;
    mxHosts: string[];
    reason?: string;
  };
  company: {
    raw: string;
    normalized: string;
    status: CompanyLocalStatus;
    comparedDomain?: string;
  };
}

export async function validateOcrLocally(result: OcrResult): Promise<OcrLocalValidation> {
  const email = await validateEmailLocally(result.email.value);
  const company = validateCompanyLocally(result.company.value, email.domain);
  return { email, company };
}

async function validateEmailLocally(value: string): Promise<OcrLocalValidation['email']> {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  const domain = normalized.includes('@') ? normalized.split('@').pop() || '' : '';

  if (!raw) {
    return { raw, normalized, status: 'empty', syntaxValid: false, domain: '', mxFound: null, mxHosts: [] };
  }

  const syntaxValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(raw);
  if (!syntaxValid) {
    return {
      raw,
      normalized,
      status: 'invalid_syntax',
      syntaxValid: false,
      domain,
      mxFound: null,
      mxHosts: [],
      reason: 'Email belum lengkap atau formatnya belum valid.',
    };
  }

  try {
    const mxHosts = await cacheGet(
      `dns:mx:${domain}`,
      async () => {
        const records = await resolveMx(domain);
        return records.map((record) => record.exchange).filter(Boolean);
      },
      3600,
    );
    return {
      raw,
      normalized,
      status: mxHosts.length > 0 ? 'valid_syntax_mx_found' : 'valid_syntax_no_mx',
      syntaxValid: true,
      domain,
      mxFound: mxHosts.length > 0,
      mxHosts,
    };
  } catch (err) {
    return {
      raw,
      normalized,
      status: 'valid_syntax_mx_unchecked',
      syntaxValid: true,
      domain,
      mxFound: null,
      mxHosts: [],
      reason: err instanceof Error ? err.message : 'MX lookup gagal.',
    };
  }
}

function validateCompanyLocally(value: string, emailDomain: string): OcrLocalValidation['company'] {
  const raw = String(value || '').trim();
  const normalized = normalizeCompany(raw);
  if (!raw) return { raw, normalized, status: 'empty' };

  const domainBase = emailDomain ? normalizeCompany(emailDomain.split('.')[0] || '') : '';
  if (!domainBase) return { raw, normalized, status: 'present' };

  const status = normalized.includes(domainBase) || domainBase.includes(normalized)
    ? 'matches_email_domain'
    : 'differs_from_email_domain';

  return { raw, normalized, status, comparedDomain: emailDomain };
}

function normalizeCompany(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(pt|cv|ud|tbk|group|grup|company|co|ltd|inc)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}
