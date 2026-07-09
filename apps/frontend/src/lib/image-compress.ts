/**
 * Compresses an image (File or data URI) on the client so the resulting
 * base64 data URI stays safely under the Server Action body limit.
 *
 * OCR (Ollama vision) does not need full camera resolution — ~1600px on the
 * long edge is plenty — so this also speeds up the upload and AI processing.
 */

const MAX_DIMENSION = 1600;
const MAX_BYTES = 900_000;

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal memuat gambar.'));
    img.src = src;
  });
}

export async function compressImageToDataUri(
  source: File | string,
  maxDimension = MAX_DIMENSION,
  maxBytes = MAX_BYTES,
): Promise<string> {
  const src = typeof source === 'string' ? source : await fileToDataUri(source);
  const img = await loadImage(src);

  let { naturalWidth: width, naturalHeight: height } = img;
  if (!width || !height) {
    width = img.width;
    height = img.height;
  }

  if (width > maxDimension || height > maxDimension) {
    const ratio = maxDimension / Math.max(width, height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Canvas unavailable (SSR) — fall back to the original source.
    return src;
  }
  ctx.drawImage(img, 0, 0, width, height);

  // Step down JPEG quality until the data URI fits the budget.
  let quality = 0.85;
  let out = canvas.toDataURL('image/jpeg', quality);
  while (out.length > maxBytes && quality > 0.3) {
    quality -= 0.1;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return out;
}

/** Convert a data URI string to a Blob (client-side). */
export function dataUriToBlob(dataUri: string): Blob {
  const [header, base64] = dataUri.split(',');
  const mime = header.split(':')[1]?.split(';')[0] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}
