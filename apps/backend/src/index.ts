import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.js';
import { sessionMiddleware } from './middleware/session.js';
import { errorHandler } from './middleware/error.js';
import { auth } from './routes/auth.js';
import { customers } from './routes/customers.js';
import { ocr } from './routes/ocr.js';
import { users } from './routes/users.js';
import { notifications } from './routes/notifications.js';
import { activities } from './routes/activities.js';
import { emailBlasts } from './routes/email-blasts.js';
import { media } from './routes/media.js';
import { analyses } from './routes/analyses.js';
import { companies } from './routes/companies.js';
import { featureFlags } from './routes/feature-flags.js';
import { reports } from './routes/reports.js';

const app = new Hono();

// ─── Global middleware ────────────────────────────────
app.use('*', cors({ origin: '*', credentials: true }));
app.use('*', sessionMiddleware);
app.onError(errorHandler);

// ─── Health check ─────────────────────────────────────
app.get('/api/v1/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ───────────────────────────────────────────
app.route('/api/v1/auth', auth);
app.route('/api/v1/customers', customers);
app.route('/api/v1/ocr', ocr);
app.route('/api/v1/users', users);
app.route('/api/v1/notifications', notifications);
app.route('/api/v1/activities', activities);
app.route('/api/v1/email-blasts', emailBlasts);
app.route('/api/v1/media', media);
app.route('/api/v1/analyses', analyses);
app.route('/api/v1/companies', companies);
app.route('/api/v1/feature-flags', featureFlags);
app.route('/api/v1/reports', reports);

// ─── Start server ────────────────────────────────────
serve(
  { fetch: app.fetch, port: config.port },
  (info) => console.log(`[backend] running on http://localhost:${info.port}`),
);
