import { Hono } from 'hono';
import { mediaAssetRepo } from '../repositories/media-assets.js';
import { uploadToR2, deleteFromR2 } from '../lib/r2.js';
import type { SessionPayload } from '../types/index.js';

const media = new Hono<{ Variables: { session: SessionPayload | null } }>();

// GET /api/v1/media
media.get('/', async (c) => {
  const assets = await mediaAssetRepo.findAll();
  return c.json({ mediaAssets: assets });
});

// POST /api/v1/media/upload
media.post('/upload', async (c) => {
  const session: SessionPayload | null = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);

  const { dataUri, assetName, tags } = await c.req.json<{
    dataUri: string; assetName?: string; tags?: string[];
  }>();

  // Upload to R2 under images/ prefix
  const matches = dataUri.match(/^data:(image\/\w+);base64,(.+)/);
  if (!matches) return c.json({ error: 'Invalid data URI' }, 400);

  const mime = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const ext = mime.split('/')[1] || 'bin';
  const key = `images/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await uploadToR2(key, buffer, mime);

  const asset = await mediaAssetRepo.create({
    assetName: assetName || key,
    fileName: key,
    imageUrl: key, // client will get presigned URL
    uploadedBy: { uid: session.uid, name: session.name },
    tags: tags || [],
  });

  return c.json({ mediaAsset: asset }, 201);
});

// DELETE /api/v1/media/:id
media.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const asset = await mediaAssetRepo.findById(id);
  if (!asset) return c.json({ error: 'Asset not found' }, 404);

  await deleteFromR2(asset.fileName);
  await mediaAssetRepo.delete(id);
  return c.json({ success: true });
});

export { media };
