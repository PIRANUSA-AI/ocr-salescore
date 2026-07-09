/**
 * OCR processing service — runs the full extraction pipeline on the backend.
 */
import { ocrJobRepo } from '../repositories/ocr-jobs.js';
import { uploadOcrImage } from '../lib/r2.js';
import type { OcrJob } from '../repositories/ocr-jobs.js';

/**
 * Proses OCR synchronously — langsung preflight, upload R2, AI extraction, slice-rescan.
 * Gak pake Redis queue. Cocok buat VPS single-server.
 */
export async function processOcrSync(
  userId: string,
  imageDataUri: string,
): Promise<OcrJob> {
  // buat job record
  const job = await ocrJobRepo.create({ userId });
  const jobId = job.id;

  try {
    await ocrJobRepo.updateStatus(jobId, 'processing');

    // Step 1: preflight
    const { assertRelevantOcrImage } = await import('../lib/ocr/preflight.js');
    const preflight = await assertRelevantOcrImage(imageDataUri);
    console.log(`[ocr] preflight ok (${preflight.confidence})`);

    // Step 2: upload ke R2
    const { key, url: imageUrl } = await uploadOcrImage(imageDataUri);
    console.log(`[ocr] r2 upload ok -> ${key}`);
    await ocrJobRepo.updateStatus(jobId, 'processing', { imageUrl });

    // Step 3: AI extraction
    const { extractCustomer } = await import('../lib/ocr/extract.js');
    const result = await extractCustomer(imageUrl, { alwaysSecondOpinion: false });
    result.imageUrl = imageUrl;

    // Step 4: slice-rescan kalo form answers kosong
    if (!result.formAnswers || result.formAnswers.length === 0) {
      console.log('[ocr] no form answers, slicing...');
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
          } catch { /* skip */ }
        }
        if (allAnswers.length > 0) result.formAnswers = allAnswers;
      } catch { /* slice scan failed */ }
    }

    // Step 5: save result
    await ocrJobRepo.updateStatus(jobId, 'done', { result, imageUrl });
    console.log(`[ocr] job ${jobId} done in ${result.elapsedMs}ms`);

    // return fresh job
    return (await ocrJobRepo.findById(jobId))!;
  } catch (err: any) {
    console.error(`[ocr] job ${jobId} failed:`, err.message);
    await ocrJobRepo.updateStatus(jobId, 'error', { errorMessage: err.message });
    return (await ocrJobRepo.findById(jobId))!;
  }
}
