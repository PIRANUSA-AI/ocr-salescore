import { config as dotenvConfig } from 'dotenv';
import { resolve } from 'path';

// Load .env from several locations (backend dir first, then frontend .env.local, then root)
dotenvConfig({ path: resolve(import.meta.dirname, '..', '.env') });
dotenvConfig({ path: resolve(import.meta.dirname, '..', '..', 'apps', 'frontend', '.env.local') });
dotenvConfig({ path: resolve(import.meta.dirname, '..', '..', '.env') });

export const config = {
  port: Number(process.env.BACKEND_PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',

  postgres: {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'salescore',
    password: process.env.PGPASSWORD || 'salescore_pass',
    database: process.env.PGDATABASE || 'salescore',
    poolSize: Number(process.env.PG_POOL_SIZE || 15),
  },

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    keyPrefix: 'salescore:',
  },

  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'salescore-ocr',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    ocrModel: process.env.OPENAI_OCR_MODEL || '',
    preflightModel: process.env.OPENAI_PREFLIGHT_MODEL || '',
    boxScanModel: process.env.OPENAI_BOX_SCAN_MODEL || '',
    identityReviewModel: process.env.OPENAI_IDENTITY_REVIEW_MODEL || '',
    verifierModel: process.env.OPENAI_VERIFIER_MODEL || '',
  },

  ollama: {
    endpoint: process.env.OLLAMA_ENDPOINT || '',
    ocrModel: process.env.OLLAMA_OCR_MODEL || '',
  },

  session: {
    secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    cookieName: 'sc_session',
  },
};
