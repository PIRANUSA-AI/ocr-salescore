import { callOpenAI } from '@/ai/openai-client';
import { createOpenAIProvider } from './openai-provider';
import { createOllamaProvider } from './ollama-provider';
import { OCR_FIELDS, type Confidence, type OcrField, type OcrResult } from './types';
import { buildVerifierSystemPrompt, buildVerifierUserPrompt, OcrResultSchema, coerceOcrResult } from './prompt';

const OCR_SCALAR_FIELDS = OCR_FIELDS.filter((f) => f !== 'formAnswers') as (keyof Omit<OcrResult, 'formAnswers'>)[];

export interface ExtractOptions {
  uncertainLevels?: Confidence[];
  alwaysSecondOpinion?: boolean;
  skipVerifier?: boolean;
}

export interface ExtractResult extends Omit<OcrResult, 'formAnswers'> {
  primaryProvider: string;
  fallbackProvider?: string;
  verifierProvider?: string;
  overriddenFields: string[];
  elapsedMs: number;
  formAnswers?: OcrResult['formAnswers'];
  /** Public R2 URL of the uploaded scan image — save this to the customer record. */
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

  // ── Stage 1: Fast extraction ──
  const base = await primary.extract(imageDataUri);

  const scalarFields = OCR_SCALAR_FIELDS;
  const uncertainFields = scalarFields.filter((f) => uncertain.includes(base[f].confidence));
  const needFallback = options.alwaysSecondOpinion || uncertainFields.length > 0;

  const { formAnswers, ...baseScalar } = base;
  const result: ExtractResult = {
    ...baseScalar,
    formAnswers,
    primaryProvider: primary.name,
    overriddenFields: [],
    elapsedMs: 0,
  };

  // ── Stage 2: Verifier (hard-thinking) ──
  // Uses OPENAI_VERIFIER_MODEL if set, otherwise falls back to the primary model.
  const verifierModel = process.env.OPENAI_VERIFIER_MODEL || process.env.OPENAI_OCR_MODEL || 'gpt-4.1';
  const useVerifier = !options.skipVerifier;

  if (useVerifier) {
    console.log(`[OCR] Stage 2: Verifier (${verifierModel}) — re-extracting from scratch`);
    try {
      const systemPrompt = buildVerifierSystemPrompt();
      const userPrompt = buildVerifierUserPrompt();

      const verified = await callOpenAI({
        systemPrompt,
        userPrompt,
        schema: OcrResultSchema,
        model: verifierModel,
        temperature: 0,
        maxTokens: 2048,
        imageDataUri,
      });

      const verifiedResult = coerceOcrResult(verified);
      result.verifierProvider = `openai:${verifierModel}`;

      let changed = 0;
      for (const field of scalarFields) {
        const orig = base[field];
        const ver = verifiedResult[field];
        if (orig.value !== ver.value || orig.confidence !== ver.confidence) {
          result[field] = ver;
          result.overriddenFields.push(field as string);
          changed++;
        }
      }
      if (verifiedResult.formAnswers) {
        result.formAnswers = verifiedResult.formAnswers;
      }

      console.log(`[OCR] Verifier overridden ${changed} field(s): [${result.overriddenFields.join(', ')}]`);
    } catch (err) {
      console.error('[OCR] Verifier failed, keeping stage 1:', err instanceof Error ? err.message : err);
    }
  }

  // ── Stage 3: Fallback second-opinion for low-confidence fields ──
  // Only attempt when Ollama is explicitly configured, to avoid wasted
  // timeouts / errors against the broken default endpoint.
  if (needFallback && process.env.OLLAMA_ENDPOINT) {
    try {
      const fallback = createOllamaProvider();
      const second = await fallback.extract(imageDataUri);
      result.fallbackProvider = fallback.name;

      for (const field of uncertainFields) {
        const primaryField: OcrField = result[field];
        const fallbackField: OcrField = second[field];
        if (fallbackField.value && isMoreConfident(fallbackField.confidence, primaryField.confidence)) {
          (result as any)[field] = fallbackField;
          result.overriddenFields.push(field as string);
        }
      }
    } catch (err) {
      console.error('[OCR] Fallback second-opinion failed:', err instanceof Error ? err.message : err);
    }
  }

  result.elapsedMs = Date.now() - start;
  return result;
}

function isMoreConfident(a: Confidence, b: Confidence): boolean {
  const rank: Record<Confidence, number> = { empty: 0, low: 1, medium: 2, high: 3 };
  return rank[a] > rank[b];
}
