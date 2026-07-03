import { createOpenAIProvider } from './openai-provider';
import { createOllamaProvider } from './ollama-provider';
import { OCR_FIELDS, type Confidence, type OcrField, type OcrResult } from './types';

/**
 * OCR orchestrator.
 *
 * 1. Run the primary model (gpt-4.1) once.
 * 2. If any field is flagged low/medium confidence, run the free fallback
 *    (gemma3) once as a second opinion.
 * 3. For uncertain fields, take the fallback value when it is more confident
 *    than the primary. Otherwise keep the primary.
 *
 * This keeps the fast path fast (most scans stop after step 1) while improving
 * accuracy on the hard handwriting / dense business card cases.
 */

export interface ExtractOptions {
  /** Confidence levels that trigger a second opinion. Default: low, medium. */
  uncertainLevels?: Confidence[];
  /** Force run the second opinion even when primary is all-high. */
  alwaysSecondOpinion?: boolean;
}

export interface ExtractResult extends OcrResult {
  /** Name of the primary provider that produced the base result. */
  primaryProvider: string;
  /** Name of the fallback provider, if it ran. */
  fallbackProvider?: string;
  /** Fields whose value was overridden by the second opinion. */
  overriddenFields: string[];
  /** Total elapsed time in ms. */
  elapsedMs: number;
}

const DEFAULT_UNCERTAIN: Confidence[] = ['low', 'medium'];

export async function extractCustomer(
  imageDataUri: string,
  options: ExtractOptions = {},
): Promise<ExtractResult> {
  const start = Date.now();
  const uncertain = options.uncertainLevels ?? DEFAULT_UNCERTAIN;
  const primary = createOpenAIProvider();

  const base = await primary.extract(imageDataUri);

  // Decide whether a second opinion is worthwhile.
  const uncertainFields = OCR_FIELDS.filter((f) => uncertain.includes(base[f].confidence));
  const needFallback = options.alwaysSecondOpinion || uncertainFields.length > 0;

  const result: ExtractResult = {
    ...base,
    primaryProvider: primary.name,
    overriddenFields: [],
    elapsedMs: 0,
  };

  if (!needFallback) {
    return { ...result, elapsedMs: Date.now() - start };
  }

  // Run the free fallback as a second opinion. Errors here are non-fatal:
  // we simply keep the primary result.
  try {
    const fallback = createOllamaProvider();
    const second = await fallback.extract(imageDataUri);
    result.fallbackProvider = fallback.name;

    for (const field of uncertainFields) {
      const primaryField: OcrField = base[field];
      const fallbackField: OcrField = second[field];
      // Take the fallback only if it is strictly more confident AND non-empty.
      if (fallbackField.value && isMoreConfident(fallbackField.confidence, primaryField.confidence)) {
        result[field] = fallbackField;
        result.overriddenFields.push(field);
      }
    }
  } catch (err) {
    console.error('[OCR] second-opinion failed, keeping primary:', err instanceof Error ? err.message : err);
  }

  result.elapsedMs = Date.now() - start;
  return result;
}

/** Returns true when `a` is a stronger confidence level than `b`. */
function isMoreConfident(a: Confidence, b: Confidence): boolean {
  const rank: Record<Confidence, number> = { empty: 0, low: 1, medium: 2, high: 3 };
  return rank[a] > rank[b];
}
