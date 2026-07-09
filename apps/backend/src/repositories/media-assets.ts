import { query } from '../db/pool.js';
import type { MediaAsset } from '../types/index.js';

type MediaAssetRow = {
  id: string;
  asset_name: string;
  file_name: string;
  image_url: string;
  uploaded_by: any;
  tags: any;
  created_at: string;
};

function rowToAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    assetName: row.asset_name,
    fileName: row.file_name,
    imageUrl: row.image_url,
    uploadedBy: row.uploaded_by ?? { uid: '', name: '' },
    tags: row.tags ?? [],
    createdAt: row.created_at,
  };
}

export const mediaAssetRepo = {
  async create(data: Omit<MediaAsset, 'id' | 'createdAt'> & { id?: string }): Promise<MediaAsset> {
    const rows = await query<MediaAssetRow>(
      `INSERT INTO media_assets (id, asset_name, file_name, image_url, uploaded_by, tags)
       VALUES (COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.id || null,
        data.assetName,
        data.fileName,
        data.imageUrl,
        JSON.stringify(data.uploadedBy),
        JSON.stringify(data.tags || []),
      ],
    );
    return rowToAsset(rows.rows[0]);
  },

  async findAll(): Promise<MediaAsset[]> {
    const rows = await query<MediaAssetRow>('SELECT * FROM media_assets ORDER BY created_at DESC');
    return rows.rows.map(rowToAsset);
  },

  async delete(id: string): Promise<void> {
    await query('DELETE FROM media_assets WHERE id = $1', [id]);
  },

  async findById(id: string): Promise<MediaAsset | null> {
    const rows = await query<MediaAssetRow>('SELECT * FROM media_assets WHERE id = $1 LIMIT 1', [id]);
    return rows.rows[0] ? rowToAsset(rows.rows[0]) : null;
  },
};
