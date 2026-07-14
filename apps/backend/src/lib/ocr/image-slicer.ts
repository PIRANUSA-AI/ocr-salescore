import sharp from 'sharp';

interface SliceResult {
  dataUri: string;
  index: number;
  region: { top: number; height: number };
}

/**
 * Downscale sebuah data URI ke sisi terpanjang <= maxDim.
 *
 * Foto HP (3000-4000px) dikirim ke OpenAI vision apa adanya akan dipecah jadi
 * puluhan tile 512px per panggilan — token & latensi meledak, padahal detail
 * itu tak perlu untuk membaca teks/checkbox form. Ukuran ~1600px sudah cukup
 * tajam untuk OCR tapi memangkas jumlah tile drastis. Idempoten: gambar yang
 * sudah kecil dikembalikan apa adanya.
 */
export async function downscaleImage(dataUri: string, maxDim: number = 1600): Promise<string> {
  const match = dataUri.match(/^data:(.*?);base64,(.*)$/);
  if (!match) return dataUri;
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  const meta = await sharp(buffer).metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longest === 0 || longest <= maxDim) return dataUri;

  const resized = await sharp(buffer)
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString('base64')}`;
}

/**
 * Slice a base64 image into N horizontal bands with overlap.
 * Returns an array of base64 data URIs for each slice.
 */
export async function sliceImage(
  dataUri: string,
  slices: number = 4,
  overlapRatio: number = 0.15,
): Promise<SliceResult[]> {
  const match = dataUri.match(/^data:(.*?);base64,(.*)$/);
  if (!match) throw new Error('Invalid data URI');
  const mime = match[1];
  const base64 = match[2];
  const buffer = Buffer.from(base64, 'base64');

  const img = sharp(buffer);
  const meta = await img.metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 600;

  const sliceH = Math.floor(height / slices);
  const overlap = Math.floor(sliceH * overlapRatio);
  const step = sliceH - overlap;

  const results: SliceResult[] = [];

  for (let i = 0; i < slices; i++) {
    const top = Math.min(i * step, height - sliceH);
    const h = Math.min(sliceH, height - top);
    if (h <= 0) break;

    const sliced = await sharp(buffer)
      .extract({ left: 0, top, width, height: h })
      .jpeg({ quality: 85 })
      .toBuffer();

    const b64 = sliced.toString('base64');
    results.push({
      dataUri: `data:${mime};base64,${b64}`,
      index: i,
      region: { top, height: h },
    });
  }

  return results;
}
