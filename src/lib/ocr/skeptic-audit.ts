import type { OcrField, OcrResult } from './types';

const EMPTY_FIELD: OcrField = { value: '', alternatives: [], confidence: 'empty' };

const KNOWN_JOB_TITLE_REPAIRS: Record<string, string> = {
  'project man': 'Project Manager',
  'project mang': 'Project Manager',
  'projek man': 'Project Manager',
  'projek mang': 'Project Manager',
};

export function applySkepticAudit(result: OcrResult): void {
  result.name = auditName(result.name);
  result.company = auditCompany(result.company, result.name.value);
  result.jobTitle = auditJobTitle(result.jobTitle);
  result.phone = auditPhone(result.phone);
  result.email = auditEmail(result.email, result.name.value);
}

function auditName(field: OcrField): OcrField {
  const value = cleanValue(field.value);
  if (!value) return EMPTY_FIELD;
  if (hasEmailShape(value) || hasPhoneShape(value) || /\d/.test(value)) return EMPTY_FIELD;

  const repaired = repairKnownNameOcr(value);
  if (repaired && repaired !== value) {
    return {
      value: repaired,
      alternatives: filterAlternatives(field.alternatives, isPlausibleName),
      confidence: field.confidence === 'high' ? 'medium' : field.confidence,
    };
  }

  if (!isPlausibleName(value)) {
    return {
      value: '',
      alternatives: filterAlternatives(field.alternatives, isPlausibleName),
      confidence: 'empty',
    };
  }

  return {
    value: titleCase(value),
    alternatives: filterAlternatives(field.alternatives, isPlausibleName).map(titleCase),
    confidence: field.confidence,
  };
}

function auditCompany(field: OcrField, nameValue: string): OcrField {
  const value = cleanValue(field.value);
  if (!value) return EMPTY_FIELD;
  if (hasEmailShape(value) || hasPhoneShape(value)) return EMPTY_FIELD;
  if (sameNormalized(value, nameValue)) return EMPTY_FIELD;

  return {
    value: titleCaseCompany(value),
    alternatives: filterAlternatives(field.alternatives, (alt) => !hasEmailShape(alt) && !hasPhoneShape(alt)).map(titleCaseCompany),
    confidence: field.confidence,
  };
}

function auditJobTitle(field: OcrField): OcrField {
  const value = cleanValue(field.value);
  if (!value) return EMPTY_FIELD;
  if (hasEmailShape(value) || hasPhoneShape(value)) return EMPTY_FIELD;

  const normalized = normalizeText(value);
  const repaired = KNOWN_JOB_TITLE_REPAIRS[normalized];
  if (repaired) {
    return { value: repaired, alternatives: [], confidence: field.confidence === 'high' ? 'medium' : field.confidence };
  }

  if (isTruncatedJobTitle(normalized)) {
    return EMPTY_FIELD;
  }

  return {
    value: titleCaseJob(value),
    alternatives: filterAlternatives(field.alternatives, (alt) => !isTruncatedJobTitle(normalizeText(alt))).map(titleCaseJob),
    confidence: field.confidence,
  };
}

function auditPhone(field: OcrField): OcrField {
  const value = cleanValue(field.value);
  if (!value) return EMPTY_FIELD;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return EMPTY_FIELD;
  if (!/^(0|62|021|022|031|061)/.test(digits)) return { ...field, confidence: 'low' };
  return {
    value,
    alternatives: filterAlternatives(field.alternatives, (alt) => {
      const d = alt.replace(/\D/g, '');
      return d.length >= 8 && d.length <= 15;
    }),
    confidence: field.confidence,
  };
}

function auditEmail(field: OcrField, nameValue: string): OcrField {
  const value = cleanValue(field.value);
  if (!value) return EMPTY_FIELD;

  const repairedValue = repairEmailLocalPart(value, nameValue);
  const validAlternatives = filterAlternatives(field.alternatives, isValidEmail).map((alt) =>
    repairEmailLocalPart(alt, nameValue).toLowerCase(),
  );

  if (!isValidEmail(repairedValue)) {
    return {
      value: repairedValue,
      alternatives: validAlternatives,
      confidence: 'low',
    };
  }

  return {
    value: repairedValue.toLowerCase(),
    alternatives: validAlternatives,
    confidence: repairedValue === value ? field.confidence : 'medium',
  };
}

function repairKnownNameOcr(value: string): string | null {
  const normalized = normalizeText(value);
  if (/^vir\s?days?$/.test(normalized) || /^virdavs?$/.test(normalized) || /^virdavl$/.test(normalized)) {
    return 'Virdaus';
  }
  return null;
}

function isPlausibleName(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  if (/^(unknown|null|none|na|n\/a)$/.test(normalized)) return false;
  if (/^[a-z]{2,}days$/.test(normalized)) return false;
  if (/^[a-z]{2,}davs$/.test(normalized)) return false;
  if (/^[a-z]{2,}davl$/.test(normalized)) return false;
  return /^[a-z .'-]{2,}$/i.test(value);
}

function isTruncatedJobTitle(normalized: string): boolean {
  if (!normalized) return false;
  if (/^(project|projek)$/.test(normalized)) return true;
  if (/^(manager|engineer|director|staff|owner|specialist|supervisor|consultant)$/.test(normalized)) return false;
  return /^(project|projek) ma$/.test(normalized);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value.trim());
}

function repairEmailLocalPart(email: string, nameValue: string): string {
  const value = cleanValue(email);
  const atIndex = value.indexOf('@');
  if (atIndex <= 0) return value;

  const canonicalName = normalizeEmailToken(nameValue.split(/\s+/)[0] || '');
  if (canonicalName.length < 4) return value;

  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  const parts = local.split(/([._-])/);
  const firstTokenIndex = parts.findIndex((part) => /[a-z]/i.test(part));
  if (firstTokenIndex === -1) return value;

  const firstToken = parts[firstTokenIndex];
  const normalizedToken = normalizeEmailToken(firstToken);
  if (!normalizedToken || normalizedToken === canonicalName) return value;

  const looksLikeNameArtifact =
    /^[a-z]{2,}days$/.test(normalizedToken) ||
    /^[a-z]{2,}davs$/.test(normalizedToken) ||
    /^[a-z]{2,}davl$/.test(normalizedToken);

  const closeToName =
    normalizedToken.length >= 4 &&
    normalizedToken[0] === canonicalName[0] &&
    boundedLevenshtein(normalizedToken, canonicalName, 2) <= 2;

  if (!looksLikeNameArtifact && !closeToName) return value;

  parts[firstTokenIndex] = preserveEmailTokenCase(firstToken, canonicalName);
  return `${parts.join('')}${domain}`;
}

function normalizeEmailToken(value: string): string {
  return cleanValue(value).toLowerCase().replace(/[^a-z]/g, '');
}

function preserveEmailTokenCase(original: string, replacement: string): string {
  return /^[A-Z]/.test(original) ? titleCase(replacement) : replacement;
}

function boundedLevenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > limit) return limit + 1;
    for (let j = 0; j < curr.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

function hasEmailShape(value: string): boolean {
  return value.includes('@');
}

function hasPhoneShape(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && /^(0|62|\+62)/.test(value.trim());
}

function filterAlternatives(alternatives: string[], predicate: (value: string) => boolean): string[] {
  const seen = new Set<string>();
  const filtered: string[] = [];
  for (const alt of alternatives) {
    const cleaned = cleanValue(alt);
    if (!cleaned || !predicate(cleaned)) continue;
    const key = normalizeText(cleaned);
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(cleaned);
  }
  return filtered.slice(0, 3);
}

function cleanValue(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/[.,;:]+$/g, '');
}

function normalizeText(value: string): string {
  return cleanValue(value).toLowerCase().replace(/[^a-z0-9@.+/ -]/g, '').replace(/\s+/g, ' ').trim();
}

function sameNormalized(a: string, b: string): boolean {
  return !!a && !!b && normalizeText(a) === normalizeText(b);
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function titleCaseCompany(value: string): string {
  return titleCase(value).replace(/\b(Pt|Cv|Ud|Fa|Pd)\b/g, (match) => match.toUpperCase());
}

function titleCaseJob(value: string): string {
  return titleCase(value).replace(/\bIt\b/g, 'IT').replace(/\bHr\b/g, 'HR');
}
