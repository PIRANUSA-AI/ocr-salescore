import { callOpenAI } from '../openai-client.js';
import { createOpenAIProvider } from './openai-provider.js';
import { createOllamaProvider } from './ollama-provider.js';
import { OCR_FIELDS, type Confidence, type OcrField, type OcrResult } from './types.js';
import { buildVerifierSystemPrompt, buildVerifierUserPrompt, OcrResultSchema, coerceOcrResult } from './prompt/index.js';
import { buildIdentityReviewSystemPrompt, buildIdentityReviewUserPrompt } from './prompt/identity-review.js';
import {
  BoxScanSchema,
  buildBoxScanSystemPrompt,
  buildBoxScanUserPrompt,
  coerceBoxScanResult,
  formatBoxScanContext,
} from './prompt/box-scan.js';
import { applySkepticAudit } from './skeptic-audit.js';
import { validateOcrLocally, type OcrLocalValidation } from './local-validation.js';

const OCR_SCALAR_FIELDS = OCR_FIELDS.filter((f) => f !== 'formAnswers') as (keyof Omit<OcrResult, 'formAnswers'>)[];
const REVIEW_FIELDS = OCR_SCALAR_FIELDS;

export interface ExtractOptions {
  uncertainLevels?: Confidence[];
  alwaysSecondOpinion?: boolean;
  skipIdentityReview?: boolean;
  skipVerifier?: boolean;
}

export interface ExtractResult extends Omit<OcrResult, 'formAnswers'> {
  primaryProvider: string;
  fallbackProvider?: string;
  boxScanProvider?: string;
  identityReviewProvider?: string;
  verifierProvider?: string;
  overriddenFields: string[];
  elapsedMs: number;
  formAnswers?: OcrResult['formAnswers'];
  rawOcrResult?: OcrResult;
  localValidation?: OcrLocalValidation;
  /** Public R2 URL of the uploaded scan image - save this to the customer record. */
  imageUrl?: string;
}

const DEFAULT_UNCERTAIN: Confidence[] = ['low', 'medium'];

export async function extractCustomer(
  imageDataUri: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const start = Date.now();
  const uncertain = options.uncertainLevels ?? DEFAULT_UNCERTAIN;
  const primary = createOpenAIProvider();

  // Stage 1: Direct full-page OCR remains the baseline.
  const base = await primary.extract(imageDataUri);

  const scalarFields = OCR_SCALAR_FIELDS;
  const uncertainFields = scalarFields.filter((f) => uncertain.includes(base[f].confidence));
  const reviewFields = REVIEW_FIELDS.filter((f) => uncertain.includes(base[f].confidence));
  const needReview = options.alwaysSecondOpinion || reviewFields.length > 0;
  const needFallback = options.alwaysSecondOpinion || uncertainFields.length > 0;

  const { formAnswers, ...baseScalar } = base;
  const result: ExtractResult = {
    ...baseScalar,
    formAnswers,
    primaryProvider: primary.name,
    overriddenFields: [],
    elapsedMs: 0,
  };

  // Stage 2: Optional box scan only helps review uncertain fields.
  // It is intentionally not used to anchor the first extraction.
  const boxScanModel = process.env.OPENAI_BOX_SCAN_MODEL || process.env.OPENAI_OCR_MODEL || 'gpt-4.1';
  let boxScanContext = '';

  if (needReview) {
    try {
      console.log(`[OCR] Stage 2: Box scan (${boxScanModel}) - mapping uncertain page fields`);
      const rawBoxScan = await callOpenAI({
        systemPrompt: buildBoxScanSystemPrompt(),
        userPrompt: buildBoxScanUserPrompt(),
        schema: BoxScanSchema,
        model: boxScanModel,
        temperature: 0,
        maxTokens: 2048,
        imageDataUri,
        imageDetail: 'high',
      });

      const boxScan = coerceBoxScanResult(rawBoxScan);
      boxScanContext = formatBoxScanContext(boxScan);
      result.boxScanProvider = `openai:${boxScanModel}`;
      console.log(`[OCR] Box scan found ${boxScan.boxes.length} box(es)`);
    } catch (err) {
      console.error('[OCR] Box scan failed, continuing with direct extraction:', err instanceof Error ? err.message : err);
    }
  }

  // Stage 3: Vision review may improve uncertain fields, but it cannot replace
  // a non-empty baseline with an equally uncertain alternative.
  const identityReviewModel = process.env.OPENAI_IDENTITY_REVIEW_MODEL;
  const useIdentityReview = !options.skipIdentityReview && needReview && !!identityReviewModel;

  if (useIdentityReview) {
    console.log(`[OCR] Stage 3: Field review (${identityReviewModel}) - rereading [${reviewFields.join(', ')}]`);
    try {
      const reviewed = await callOpenAI({
        systemPrompt: buildIdentityReviewSystemPrompt(),
        userPrompt: buildIdentityReviewUserPrompt(result, boxScanContext || undefined),
        schema: OcrResultSchema,
        model: identityReviewModel,
        temperature: 0,
        maxTokens: 2048,
        imageDataUri,
        imageDetail: 'high',
      });

      const reviewedResult = coerceOcrResult(reviewed);
      result.identityReviewProvider = `openai:${identityReviewModel}`;

      let changed = 0;
      for (const field of REVIEW_FIELDS) {
        const orig = result[field];
        const reviewedField = reviewedResult[field];
        if (shouldAcceptReview(orig, reviewedField)) {
          result[field] = reviewedField;
          result.overriddenFields.push(field as string);
          changed++;
        }
      }

      console.log(`[OCR] Field review overridden ${changed} field(s)`);
    } catch (err) {
      console.error('[OCR] Field review failed, keeping previous result:', err instanceof Error ? err.message : err);
    }
  }

  // Stage 4: Text-only verifier reviews current JSON.
  const verifierModel = process.env.OPENAI_VERIFIER_MODEL || process.env.OPENAI_OCR_MODEL || 'gpt-4.1';
  const useVerifier = !options.skipVerifier;

  if (useVerifier) {
    console.log(`[OCR] Stage 4: Verifier (${verifierModel}) - reviewing current output`);
    try {
      const verified = await callOpenAI({
        systemPrompt: buildVerifierSystemPrompt(),
        userPrompt: buildVerifierUserPrompt(result),
        schema: OcrResultSchema,
        model: verifierModel,
        temperature: 0,
        maxTokens: 2048,
      });

      const verifiedResult = coerceOcrResult(verified);
      result.verifierProvider = `openai:${verifierModel}`;

      let changed = 0;
      for (const field of scalarFields) {
        const orig = result[field];
        const ver = verifiedResult[field];
        if (shouldAcceptReview(orig, ver)) {
          result[field] = ver;
          result.overriddenFields.push(field as string);
          changed++;
        }
      }
      if (verifiedResult.formAnswers && formAnswersLookSane(result.formAnswers, verifiedResult.formAnswers)) {
        result.formAnswers = verifiedResult.formAnswers;
      }

      console.log(`[OCR] Verifier overridden ${changed} field(s): [${result.overriddenFields.join(', ')}]`);
    } catch (err) {
      console.error('[OCR] Verifier failed, keeping current result:', err instanceof Error ? err.message : err);
    }
  }

  // Stage 5: Fallback second-opinion for low-confidence fields.
  if (needFallback && process.env.OLLAMA_ENDPOINT) {
    try {
      const fallback = createOllamaProvider();
      const second = await fallback.extract(imageDataUri);
      result.fallbackProvider = fallback.name;

      for (const field of uncertainFields) {
        const primaryField: OcrField = result[field];
        const fallbackField: OcrField = second[field];
        if (fallbackField.value && isMoreConfident(fallbackField.confidence, primaryField.confidence)) {
          result[field] = fallbackField;
          result.overriddenFields.push(field as string);
        }
      }
    } catch (err) {
      console.error('[OCR] Fallback second-opinion failed:', err instanceof Error ? err.message : err);
    }
  }

  result.rawOcrResult = cloneOcrResult(result);
  applySkepticAudit(result);
  result.localValidation = await validateOcrLocally(result);
  result.elapsedMs = Date.now() - start;
  return result;
}

function isMoreConfident(a: Confidence, b: Confidence): boolean {
  const rank: Record<Confidence, number> = { empty: 0, low: 1, medium: 2, high: 3 };
  return rank[a] > rank[b];
}

function shouldAcceptReview(current: OcrField, reviewed: OcrField): boolean {
  if (!reviewed.value) return false;
  if (!current.value) return true;
  if (reviewed.value === current.value && reviewed.confidence === current.confidence) return false;
  return isMoreConfident(reviewed.confidence, current.confidence);
}

// The verifier is text-only and never re-reads the image, so it cannot legitimately
// re-derive checkbox marks. Only accept its formAnswers if every question it returned
// already existed in the original array (no renamed/invented questions).
function formAnswersLookSane(
  original: OcrResult['formAnswers'],
  verified: OcrResult['formAnswers'],
): boolean {
  if (!verified) return false;
  const originalQuestions = new Set((original ?? []).map((qa) => qa.question));
  return verified.every((qa) => originalQuestions.has(qa.question));
}

function cloneOcrResult(result: ExtractResult): OcrResult {
  return {
    name: { ...result.name, alternatives: [...result.name.alternatives] },
    company: { ...result.company, alternatives: [...result.company.alternatives] },
    jobTitle: { ...result.jobTitle, alternatives: [...result.jobTitle.alternatives] },
    division: { ...result.division, alternatives: [...result.division.alternatives] },
    phone: { ...result.phone, alternatives: [...result.phone.alternatives] },
    email: { ...result.email, alternatives: [...result.email.alternatives] },
    softwareNeeds: { ...result.softwareNeeds, alternatives: [...result.softwareNeeds.alternatives] },
    address: { ...result.address, alternatives: [...result.address.alternatives] },
    formAnswers: result.formAnswers ? result.formAnswers.map((answer) => ({ ...answer })) : undefined,
  };
}
