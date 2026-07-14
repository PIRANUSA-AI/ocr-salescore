import { z } from 'zod';
import { buildSystemPrompt } from './system.js';
import { buildLogicPrompt } from './logic.js';
import { buildGuardrailPrompt } from './guardrails.js';
import { buildUserPrompt } from './template.js';
import type { FormTeam } from '../types.js';
import { buildVerifierSystemPrompt, buildVerifierUserPrompt } from './verifier.js';
import { VALID_CONFIDENCE, OCR_FIELDS, type OcrResult, type OcrField, type FormAnswer, type Confidence } from '../types.js';

export function buildOcrSystemPrompt(): string {
  return `${buildSystemPrompt()}

${buildLogicPrompt()}

${buildGuardrailPrompt()}`;
}

export function buildOcrUserPrompt(imageDataUri: string, extraContext?: string, team?: FormTeam): string {
  return buildUserPrompt(imageDataUri, extraContext, team);
}

export function buildOcrMessages(imageDataUri: string, extraContext?: string, team?: FormTeam) {
  return {
    systemPrompt: buildOcrSystemPrompt(),
    userPrompt: buildOcrUserPrompt(imageDataUri, extraContext, team),
    imageDataUri,
  };
}

const OcrFieldSchema = z.object({
  value: z.string(),
  alternatives: z.array(z.string()).default([]),
  confidence: z.enum(['high', 'medium', 'low', 'empty']),
});

const FormAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
});

export const OcrResultSchema = z.object({
  name: OcrFieldSchema,
  company: OcrFieldSchema,
  jobTitle: OcrFieldSchema,
  division: OcrFieldSchema,
  phone: OcrFieldSchema,
  email: OcrFieldSchema,
  softwareNeeds: OcrFieldSchema,
  address: OcrFieldSchema,
  formAnswers: z.array(FormAnswerSchema).optional(),
});

export type RawOcrResult = z.infer<typeof OcrResultSchema>;

export function coerceOcrResult(raw: any): OcrResult {
  const result: any = {};
  for (const field of OCR_FIELDS) {
    if (field === 'formAnswers') continue;
    const entry = raw?.[field];
    const value = typeof entry === 'string' ? entry : String(entry?.value ?? '');
    const alternatives = Array.isArray(entry?.alternatives) ? entry.alternatives : [];
    let confidence: Confidence = typeof entry === 'object' && entry ? entry.confidence : 'high';
    if (!VALID_CONFIDENCE.includes(confidence)) {
      confidence = value ? 'medium' : 'empty';
    }
    result[field] = { value: value.trim(), alternatives, confidence };
  }

  const formAnswers: FormAnswer[] = [];
  if (Array.isArray(raw?.formAnswers)) {
    for (const fa of raw.formAnswers) {
      if (fa?.question && fa?.answer) {
        formAnswers.push({ question: String(fa.question), answer: String(fa.answer) });
      }
    }
  }
  if (formAnswers.length > 0) {
    result.formAnswers = formAnswers;
  }

  // ── Fallback: infer name from email if name is empty ──
  if (!result.name?.value && result.email?.value) {
    const inferred = inferNameFromEmail(result.email.value);
    if (inferred) {
      result.name = { value: inferred, alternatives: [], confidence: 'medium' };
    }
  }

  return result as OcrResult;
}

/**
 * If the email contains a plausible name before @, extract it.
 * "octavianda.Damarati@senzo.id" → "Octavianda Damarati"
 * "budi@gmail.com" → "Budi"
 * Returns null if the result isn't name-like (has numbers, single word, etc.).
 */
function inferNameFromEmail(email: string): string | null {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return null;
  const local = email.slice(0, atIndex);
  // Split by common separators
  const parts = local.split(/[._\-]+/).filter(Boolean);
  if (parts.length === 0) return null;

  const cleaned = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .filter((p) => /^[A-Za-z]+$/.test(p)); // only letters

  if (cleaned.length === 0 || cleaned.some((p) => p.length < 2)) return null;

  return cleaned.join(' ');
}

export { buildVerifierSystemPrompt, buildVerifierUserPrompt } from './verifier.js';

export function buildVerifierMessages(primaryResult?: Record<string, any>) {
  return {
    systemPrompt: buildVerifierSystemPrompt(),
    userPrompt: buildVerifierUserPrompt(primaryResult),
  };
}

export function extractJsonObject(text: string): string | null {
  if (!text) return null;
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  return t.slice(first, last + 1);
}
