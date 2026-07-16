import { ocrJobRepo } from '../repositories/ocr-jobs.js';
import { uploadOcrImage, downloadFromR2 } from '../lib/r2.js';
import type { OcrJob } from '../repositories/ocr-jobs.js';

function optionKeywords(label: string): string[] {
  const base = label.toLowerCase();
  const outside = base.replace(/\([^)]*\)/g, ' ');
  const inside = (base.match(/\(([^)]*)\)/g) ?? []).map(s => s.replace(/[()]/g, ''));
  const kws = new Set<string>();
  kws.add(base.trim());
  for (const chunk of [outside, ...inside]) {
    for (const tok of chunk.split(/[/&,]/)) {
      const t = tok.trim();
      if (t.length >= 3) kws.add(t);
    }
  }
  return [...kws].filter(Boolean);
}
function optionInText(option: string, text: string): boolean {
  const t = text.toLowerCase();
  return optionKeywords(option).some(kw => t.includes(kw));
}

const REQUIRED_SECTIONS: { key: string; label: string; keywords: string[]; options: string[] }[] = [
  { key: 'industri', label: 'Industri', keywords: ['industri'],
    options: ['Otomotif & Komponen', 'Elektronik & Elektrikal', 'Logam & Fabrikasi', 'Alat Berat & Machinery', 'Plastik, Kimia & Kemasan'] },
  { key: 'produk', label: 'Produk yang diminati', keywords: ['produk', 'minat'],
    options: ['ZWCAD (2D/3D CAD)', 'ZW3D (Desain 3D & CAM)', 'SketchUp', 'ANSYS (Simulasi/CAE)', '3D Scanner (Scanology/Shining)'] },
  { key: 'software', label: 'Software yang digunakan saat ini', keywords: ['software', 'digunakan', 'saat ini'],
    options: ['AutoCAD', 'SolidWorks', 'Autodesk Inventor/Fusion 360', 'ANSYS/software simulasi lain', 'ZWCAD/ZW3D/SketchUp'] },
  { key: 'rencana', label: 'Kapan rencana pembelian', keywords: ['rencana', 'pembelian', 'kapan'],
    options: ['<3 bulan', '3-6 bulan', '>6 bulan', 'Belum ada'] },
  { key: 'tindak', label: 'Tindak lanjut', keywords: ['tindak', 'follow'],
    options: ['Demo', 'Trial/POC', 'Penawaran', 'Kunjungan', 'Follow-up Call'] },
  { key: 'skor', label: 'Skor', keywords: ['skor', 'score'],
    options: ['High', 'Medium', 'Low'] },
];
const SINGLE_SELECT = new Set(['industri', 'rencana', 'skor']);

export async function runOcrPipeline(
  imageDataUri: string,
  team: 'AEC' | 'MFG' = 'AEC',
): Promise<{ result: any }> {
  const { assertRelevantOcrImage } = await import('../lib/ocr/preflight.js');
  const preflight = await assertRelevantOcrImage(imageDataUri);
  console.log(`[ocr] preflight ok (${preflight.confidence})`);

  const { downscaleImage } = await import('../lib/ocr/image-slicer.js');
  const workingImage = await downscaleImage(imageDataUri, 1600);

  const { extractCustomer } = await import('../lib/ocr/extract.js');
  const result = await extractCustomer(workingImage, { alwaysSecondOpinion: false, team });

  const hasSection = (answers: { question: string }[], keywords: string[]) =>
    answers.some(fa => keywords.some(k => fa.question.toLowerCase().includes(k)));
  const current = result.formAnswers ?? [];
  const missingSections = REQUIRED_SECTIONS.filter(s => !hasSection(current, s.keywords));

  const optionCount = (keywords: string[]): number => {
    const fa = current.find(a => keywords.some(k => a.question.toLowerCase().includes(k)));
    if (!fa || !fa.answer.trim()) return 0;
    return fa.answer.split(',').map(s => s.trim()).filter(Boolean).length;
  };

  const dirtySingles = REQUIRED_SECTIONS.filter(
    s => SINGLE_SELECT.has(s.key) && optionCount(s.keywords) !== 1,
  );
  const needSlice = missingSections.length > 0 || dirtySingles.length > 0;

  if (!needSlice) {
    console.log('[ocr] slice-rescan skipped (semua section lengkap, single-select bersih)');
  } else {
    const reasons = [
      ...missingSections.map(s => `missing:${s.key}`),
      ...dirtySingles.map(s => `uncertain:${s.key}`),
    ];
    console.log(`[ocr] slice-rescan ([${reasons.join(', ')}])`);
    try {
      const { sliceImage } = await import('../lib/ocr/image-slicer.js');
      const { callOpenAI } = await import('../lib/openai-client.js');
      const { buildSliceFormPrompt } = await import('../lib/ocr/prompt/template.js');
      const { z } = await import('zod');

      const SliceSchema = z.object({
        formAnswers: z.array(z.object({ question: z.string(), answer: z.string() })),
      });

      const slices = await sliceImage(workingImage, 5, 0.1);
      const affirmative = (a: string) => {
        const t = a.toLowerCase().trim();
        return t === 'checked' || t === 'true' || t === 'ya' || t === 'x' || t === '\u2713' || t === 'v';
      };
      const collected = new Map<string, Set<string>>();
      const addOption = (sectionKey: string, option: string) => {
        if (!collected.has(sectionKey)) collected.set(sectionKey, new Set());
        collected.get(sectionKey)!.add(option);
      };

      const sliceResults = await Promise.all(
        slices.map(slice =>
          callOpenAI({
            systemPrompt: buildSliceFormPrompt(team),
            userPrompt: 'Ekstrak form answers dari slice gambar ini.',
            schema: SliceSchema,
            model: process.env.OPENAI_OCR_MODEL || 'gpt-4.1',
            temperature: 0,
            maxTokens: 1024,
            imageDataUri: slice.dataUri,
            imageDetail: 'high',
          }).catch(() => null)
        )
      );

      for (const sliceResult of sliceResults) {
        if (!sliceResult) continue;
        for (const fa of sliceResult.formAnswers ?? []) {
          if (!fa.answer) continue;
          const qLower = fa.question.toLowerCase();

          const byQuestion = REQUIRED_SECTIONS.find(s => s.keywords.some(k => qLower.includes(k)));
          if (byQuestion) {
            byQuestion.options.filter(o => optionInText(o, fa.answer)).forEach(o => addOption(byQuestion.key, o));
            continue;
          }

          if (affirmative(fa.answer)) {
            const owner = REQUIRED_SECTIONS.find(s => s.options.some(o => optionInText(o, fa.question)));
            const opt = owner?.options.find(o => optionInText(o, fa.question));
            if (owner && opt) addOption(owner.key, opt);
          }
        }
      }

      const merged = current.filter(fa => {
        const section = REQUIRED_SECTIONS.find(s => s.keywords.some(k => fa.question.toLowerCase().includes(k)));
        if (!section) return true;
        const sliceOpts = collected.get(section.key);
        if (SINGLE_SELECT.has(section.key) && sliceOpts && sliceOpts.size === 1) return false;
        return true;
      });
      for (const section of REQUIRED_SECTIONS) {
        const opts = collected.get(section.key);
        if (!opts || opts.size === 0) continue;
        const already = merged.some(fa => section.keywords.some(k => fa.question.toLowerCase().includes(k)));
        if (already) continue;
        merged.push({ question: section.label, answer: [...opts].join(', ') });
      }
      if (merged.length > 0) result.formAnswers = merged;
    } catch { }
  }

  return { result };
}

export async function processOcrSync(
  userId: string,
  imageDataUri: string,
  team: 'AEC' | 'MFG' = 'AEC',
): Promise<OcrJob> {
  const job = await ocrJobRepo.create({ userId });
  const jobId = job.id;

  try {
    await ocrJobRepo.updateStatus(jobId, 'processing');

    const { key, url: imageUrl } = await uploadOcrImage(imageDataUri);
    console.log(`[ocr] r2 upload ok -> ${key}`);

    const { result } = await runOcrPipeline(imageDataUri, team);
    result.imageUrl = imageUrl;

    await ocrJobRepo.updateStatus(jobId, 'done', { result, imageUrl });
    console.log(`[ocr] job ${jobId} done in ${result.elapsedMs}ms`);

    return (await ocrJobRepo.findById(jobId))!;
  } catch (err: any) {
    console.error(`[ocr] job ${jobId} failed:`, err.message);
    await ocrJobRepo.updateStatus(jobId, 'error', { errorMessage: err.message });
    return (await ocrJobRepo.findById(jobId))!;
  }
}

export async function executeOcrPipeline(jobId: string, team: 'AEC' | 'MFG' = 'AEC'): Promise<void> {
  const job = await ocrJobRepo.findById(jobId);
  if (!job) {
    console.error(`[ocr] job ${jobId} not found`);
    return;
  }

  try {
    await ocrJobRepo.updateStatus(jobId, 'processing');

    const { buffer, contentType } = await downloadFromR2(extractR2Key(job.imageUrl!));
    const mime = contentType.startsWith('image/') ? contentType : 'image/jpeg';
    const base64 = buffer.toString('base64');
    const dataUri = `data:${mime};base64,${base64}`;

    const { result } = await runOcrPipeline(dataUri, team);
    const imgUrl = job.imageUrl ?? '';
    result.imageUrl = imgUrl;

    await ocrJobRepo.updateStatus(jobId, 'done', { result, imageUrl: imgUrl });
    console.log(`[ocr] job ${jobId} done in ${result.elapsedMs}ms`);
  } catch (err: any) {
    console.error(`[ocr] job ${jobId} failed:`, err.message);
    await ocrJobRepo.updateStatus(jobId, 'error', { errorMessage: err.message });
  }
}

function extractR2Key(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    const pathname = decodeURIComponent(url.pathname);
    return pathname.startsWith('/') ? pathname.slice(1) : pathname;
  } catch {
    return imageUrl;
  }
}
