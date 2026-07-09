/**
 * OCR processing service — runs the full extraction pipeline on the backend.
 * Steps: preflight → upload to R2 → AI extraction → slice-rescan → save result.
 */
import { ocrJobRepo } from '../repositories/ocr-jobs.js';
import { uploadOcrImage } from '../lib/r2.js';
import { getRedis } from '../lib/redis.js';
import type { OcrJob } from '../repositories/ocr-jobs.js';

const QUEUE_KEY = 'ocr:queue';
const RESULT_CHANNEL = 'ocr:result';

/**
 * Creates a job record, pushes to Redis queue, and returns immediately.
 * The worker (processNextJob) picks it up asynchronously.
 */
export async function submitOcrJob(
  userId: string,
  imageDataUri: string,
): Promise<OcrJob> {
  const job = await ocrJobRepo.create({ userId });

  // Push to Redis queue for async processing
  await getRedis().rpush(QUEUE_KEY, JSON.stringify({ jobId: job.id, imageDataUri, userId }));
  console.log(`[ocr] Job ${job.id} queued for user ${userId}`);

  // Kick off processing inline (since we're single-server)
  processNextJob().catch(err => console.error('[ocr] worker error:', err));

  return job;
}

/**
 * Pops one job from the Redis queue, runs the full OCR pipeline,
 * updates the job record in Postgres, and publishes completion.
 */
async function processNextJob(): Promise<void> {
  const raw = await getRedis().lpop(QUEUE_KEY);
  if (!raw) return;

  const { jobId, imageDataUri, userId } = JSON.parse(raw);
  console.log(`[ocr] Processing job ${jobId}...`);

  try {
    await ocrJobRepo.updateStatus(jobId, 'processing');

    // ─── Step 1: Preflight ──────────────────────────────
    const { assertRelevantOcrImage } = await import('../lib/ocr/preflight.js');
    const preflight = await assertRelevantOcrImage(imageDataUri);
    console.log(`[ocr] Preflight OK (${preflight.confidence})`);

    // ─── Step 2: Upload to R2 ────────────────────────────
    const { key, url: imageUrl } = await uploadOcrImage(imageDataUri);
    console.log(`[ocr] R2 upload OK → ${key}`);
    await ocrJobRepo.updateStatus(jobId, 'processing', { imageUrl });

    // ─── Step 3: AI extraction ───────────────────────────
    const { extractCustomer } = await import('../lib/ocr/extract.js');
    const result = await extractCustomer(imageUrl, { alwaysSecondOpinion: false });
    result.imageUrl = imageUrl;

    // ─── Step 4: Slice-rescan if no form answers ────────
    if (!result.formAnswers || result.formAnswers.length === 0) {
      console.log('[ocr] No form answers, trying slice scan...');
      try {
        const { sliceImage } = await import('../lib/ocr/image-slicer.js');
        const { callOpenAI } = await import('../lib/openai-client.js');
        const { buildSliceFormPrompt } = await import('../lib/ocr/prompt/template.js');
        const { z } = await import('zod');

        const SliceSchema = z.object({
          formAnswers: z.array(z.object({ question: z.string(), answer: z.string() })),
        });

        const slices = await sliceImage(imageDataUri, 5, 0.1);
        const allAnswers: { question: string; answer: string }[] = [];
        const seen = new Set<string>();

        for (const slice of slices) {
          try {
            const sliceResult = await callOpenAI({
              systemPrompt: buildSliceFormPrompt(),
              userPrompt: 'Ekstrak form answers dari slice gambar ini.',
              schema: SliceSchema,
              model: process.env.OPENAI_OCR_MODEL || 'gpt-4.1',
              temperature: 0,
              maxTokens: 1024,
              imageDataUri: slice.dataUri,
            });
            for (const fa of sliceResult.formAnswers ?? []) {
              const k = fa.question.toLowerCase().trim();
              if (fa.answer && !seen.has(k)) { seen.add(k); allAnswers.push(fa); }
            }
          } catch { /* skip failed slice */ }
        }
        if (allAnswers.length > 0) result.formAnswers = allAnswers;
      } catch { /* slice scan failed, continue */ }
    }

    // ─── Step 5: Save result ─────────────────────────────
    await ocrJobRepo.updateStatus(jobId, 'done', { result, imageUrl });
    console.log(`[ocr] Job ${jobId} done in ${result.elapsedMs}ms`);

    // Publish to Redis for real-time subscribers
    await getRedis().publish(RESULT_CHANNEL, JSON.stringify({ jobId, status: 'done', userId }));
  } catch (err: any) {
    console.error(`[ocr] Job ${jobId} failed:`, err.message);
    await ocrJobRepo.updateStatus(jobId, 'error', { errorMessage: err.message });
    await getRedis().publish(RESULT_CHANNEL, JSON.stringify({ jobId, status: 'error', userId }));
  }
}
