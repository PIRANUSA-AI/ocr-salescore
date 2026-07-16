/**
 * OCR processing service — runs the full extraction pipeline on the backend.
 */
import { ocrJobRepo } from '../repositories/ocr-jobs.js';
import { uploadOcrImage } from '../lib/r2.js';
import type { OcrJob } from '../repositories/ocr-jobs.js';

// Label opsi MFG panjang & bertanda kurung/slash. Turunkan jadi keyword khas
// supaya teks slice yang ringkas tetap cocok (selaras dgn matcher frontend).
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

/**
 * Proses OCR synchronously — langsung preflight, upload R2, AI extraction, slice-rescan.
 * Gak pake Redis queue. Cocok buat VPS single-server.
 */
export async function processOcrSync(
  userId: string,
  imageDataUri: string,
  team: 'AEC' | 'MFG' = 'AEC',
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

    // Step 3: AI extraction.
    // Downscale SEKALI dan pakai versi kecil untuk semua panggilan vision. Foto HP
    // full-res dikirim ke OpenAI dipecah jadi puluhan tile → token & latensi meledak
    // (satu scan bisa 4-9x kirim gambar). ~1600px cukup tajam untuk teks/checkbox.
    // R2 tetap menyimpan gambar ASLI untuk ditampilkan di UI.
    const { downscaleImage } = await import('../lib/ocr/image-slicer.js');
    const workingImage = await downscaleImage(imageDataUri, 1600);

    const { extractCustomer } = await import('../lib/ocr/extract.js');
    const result = await extractCustomer(workingImage, { alwaysSecondOpinion: false, team });
    result.imageUrl = imageUrl;
    result.imageKey = key;

    // Step 4: slice-rescan kalau ada SECTION WAJIB yang hilang.
    // Full-page pass sering melewati satu section (mis. Industri / Software) diam-diam
    // walau section lain terisi — jadi trigger tidak boleh cuma "formAnswers kosong total".
    // Setiap section dipetakan ke kata kunci pertanyaan; yang belum ada dibaca ulang via slice.
    // `label` = teks pertanyaan kanonik yang dicari matcher frontend.
    // `options` = pilihan MFG untuk section itu; dipakai menormalkan output slice
    // yang kadang berupa {question:"<nama opsi>", answer:"checked"}.
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
    // Section single-select (radio) — jawaban tepat 1. Kalau slice per-band yakin
    // menemukan 1 opsi dan berbeda dari full-page, slice lebih dipercaya (gambar
    // di-crop per pita jadi lebih tajam). Multi-select tetap additive, tidak ditimpa.
    const SINGLE_SELECT = new Set(['industri', 'rencana', 'skor']);
    const hasSection = (answers: { question: string }[], keywords: string[]) =>
      answers.some(fa => keywords.some(k => fa.question.toLowerCase().includes(k)));

    const current = result.formAnswers ?? [];
    const missingSections = REQUIRED_SECTIONS.filter(s => !hasSection(current, s.keywords));

    // Berapa opsi yang full-page baca untuk sebuah section (answer = "A, B, C").
    const optionCount = (keywords: string[]): number => {
      const fa = current.find(a => keywords.some(k => a.question.toLowerCase().includes(k)));
      if (!fa || !fa.answer.trim()) return 0;
      return fa.answer.split(',').map(s => s.trim()).filter(Boolean).length;
    };

    // Slice-rescan SMART (Opsi B): 5 panggilan gambar/scan itu mahal & lambat,
    // jadi jangan selalu jalan — tapi single-select (Industri/Rencana/Skor) di
    // form 2-kolom rawan salah baris/kolom, jadi tetap di-cross-check kecuali
    // full-page sudah baca TEPAT 1 opsi bersih.
    // Trigger slice kalau:
    //   - ada section wajib yang HILANG, atau
    //   - ada single-select yang kebaca 0 opsi (kelewat) atau 2+ opsi (bingung —
    //     radio harusnya 1). Single-select yang tepat 1 opsi → dipercaya, skip.
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
        return t === 'checked' || t === 'true' || t === 'ya' || t === 'x' || t === '✓' || t === 'v';
      };
      // Opsi tercentang yang ditemukan slice, per section.
      const collected = new Map<string, Set<string>>();
      const addOption = (sectionKey: string, option: string) => {
        if (!collected.has(sectionKey)) collected.set(sectionKey, new Set());
        collected.get(sectionKey)!.add(option);
      };

      // Slice dijalankan PARALEL — 5 panggilan sekuensial bikin total scan 30-45s
      // dan menembus timeout proxy. Paralel memangkasnya jadi ~selama 1 slice.
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

          // Format A: question = nama section, answer = pilihan (mis. "Industri" -> "Elektronik").
          const byQuestion = REQUIRED_SECTIONS.find(s => s.keywords.some(k => qLower.includes(k)));
          if (byQuestion) {
            byQuestion.options.filter(o => optionInText(o, fa.answer)).forEach(o => addOption(byQuestion.key, o));
            continue;
          }

          // Format B: question = nama opsi, answer = "checked" (mis. "Elektronik & Elektrikal" -> "checked").
          if (affirmative(fa.answer)) {
            const owner = REQUIRED_SECTIONS.find(s => s.options.some(o => optionInText(o, fa.question)));
            const opt = owner?.options.find(o => optionInText(o, fa.question));
            if (owner && opt) addOption(owner.key, opt);
          }
        }
      }

      // Gabung: hilang → isi dari slice; single-select yang slice yakin (tepat 1) →
      // timpa full-page; sisanya biarkan full-page.
      const merged = current.filter(fa => {
        const section = REQUIRED_SECTIONS.find(s => s.keywords.some(k => fa.question.toLowerCase().includes(k)));
        if (!section) return true; // Catatan, Sales code, dll — biarkan
        const sliceOpts = collected.get(section.key);
        if (SINGLE_SELECT.has(section.key) && sliceOpts && sliceOpts.size === 1) return false; // akan diganti slice
        return true;
      });
      for (const section of REQUIRED_SECTIONS) {
        const opts = collected.get(section.key);
        if (!opts || opts.size === 0) continue;
        const already = merged.some(fa => section.keywords.some(k => fa.question.toLowerCase().includes(k)));
        if (already) continue; // full-page multi-select dipertahankan
        merged.push({ question: section.label, answer: [...opts].join(', ') });
      }
      if (merged.length > 0) result.formAnswers = merged;
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
