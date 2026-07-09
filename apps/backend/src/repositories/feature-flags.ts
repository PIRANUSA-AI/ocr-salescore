import { query } from '../db/pool.js';
import type { FeatureFlag } from '../types/index.js';

type FeatureFlagRow = {
  id: string;
  name: string;
  description: string;
  is_enabled: boolean;
};

export const featureFlagRepo = {
  async findAll(): Promise<FeatureFlag[]> {
    const rows = await query<FeatureFlagRow>('SELECT * FROM feature_flags ORDER BY id');
    return rows.rows.map(r => ({
      id: r.id as FeatureFlag['id'],
      name: r.name,
      description: r.description,
      isEnabled: r.is_enabled,
    }));
  },

  async update(id: string, isEnabled: boolean): Promise<void> {
    await query('UPDATE feature_flags SET is_enabled = $1, updated_at = NOW() WHERE id = $2', [isEnabled, id]);
  },
};
