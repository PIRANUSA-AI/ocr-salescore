import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'crypto';
import { analysisRepo } from '../repositories/analyses.js';
import { customerRepo } from '../repositories/customers.js';
import { callOpenAI } from '../lib/openai-client.js';
import type { SessionPayload } from '../types/index.js';

const analyses = new Hono<{ Variables: { session: SessionPayload | null } }>();

const TopicRecommendationSchema = z.object({
  topic: z.string(),
  rationale: z.string(),
  source: z.string(),
});
const TopicRecommendationsOutputSchema = z.object({ recommendations: z.array(TopicRecommendationSchema) });

const WebinarAnalysisSchema = z.object({
  rating: z.string(),
  ringkasan: z.string(),
  poin_positif: z.string(),
  area_peningkatan: z.string(),
});

const GenerateHooksOutputSchema = z.object({
  generatedHooks: z.array(z.record(z.any()).and(z.object({ hook_chat: z.string() }))),
});

function csvRows(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map(toCamelCase);
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || '']));
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      out.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  out.push(current.trim());
  return out;
}

function toCamelCase(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
    index === 0 ? word.toLowerCase() : word.toUpperCase(),
  ).replace(/\s/g, '');
}

function csvUnparse(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map(row => headers.map(header => escape(row[header])).join(','))].join('\n');
}

function findValueByKeyKeywords(obj: any, keywords: string[]): string {
  const foundKey = Object.keys(obj || {}).find(k => keywords.some(kw => k.toLowerCase().includes(kw.toLowerCase())));
  return foundKey ? String(obj[foundKey] || '').trim() : '';
}

async function generateProspects(feedbackData: string, webinarTitle: string) {
  const result = await callOpenAI({
    schema: GenerateHooksOutputSchema,
    temperature: 0.3,
    maxTokens: 4096,
    systemPrompt: `Anda adalah AI Data Extractor & Sales Strategist dari PT PIRANUSA.

TUGAS:
1. Baca file CSV daftar peserta webinar.
2. Untuk setiap baris, buat objek JSON dengan key dari header CSV (camelCase).
3. Tambahkan field hook_chat: pesan WhatsApp pembuka yang personal.

Output JSON dengan field "generatedHooks" (array of objects). SETIAP objek WAJIB memiliki properti hook_chat.`,
    userPrompt: `Data CSV Peserta Webinar:\n\n\`\`\`csv\n${feedbackData}\n\`\`\`\n\nJudul webinar: ${webinarTitle}\nProses setiap baris dan hasilkan hook chat untuk setiap peserta.`,
  });

  return result.generatedHooks.map((prospect: any) => ({
    ...prospect,
    name: findValueByKeyKeywords(prospect, ['nama', 'name']) || 'Nama Tidak Ditemukan',
    company: findValueByKeyKeywords(prospect, ['perusahaan', 'company', 'instansi', 'organization']) || 'Perusahaan Tidak Ditemukan',
    email: findValueByKeyKeywords(prospect, ['email', 'mail']),
    phone: findValueByKeyKeywords(prospect, ['phone', 'mobile', 'hp', 'wa', 'whatsapp', 'telp']),
    jobTitle: findValueByKeyKeywords(prospect, ['jabatan', 'job', 'role', 'position']),
  }));
}

async function recommendTopics(pollData: string, webinarTitle: string) {
  return callOpenAI({
    schema: TopicRecommendationsOutputSchema,
    temperature: 0.4,
    maxTokens: 1024,
    systemPrompt: `Anda adalah AI Content Strategist untuk PT PIRANUSA, distributor software CAD. Hasilkan 5 rekomendasi topik webinar dari data polling feedback peserta. Output JSON dengan field recommendations array {topic, rationale, source}.`,
    userPrompt: `Judul Webinar Terakhir: ${webinarTitle}\n\nData Polling Topik CSV:\n\`\`\`csv\n${pollData}\n\`\`\``,
  });
}

async function analyzeFeedback(feedbackData: string) {
  const participantCount = Math.max(feedbackData.trim().split(/\r?\n/).length - 1, 0);
  if (participantCount === 0) {
    return { participantCount: 0, rating: 'N/A', ringkasan: 'Tidak ada data peserta untuk dianalisis.', poin_positif: 'Tidak ada data.', area_peningkatan: 'Tidak ada data.' };
  }
  const output = await callOpenAI({
    schema: WebinarAnalysisSchema,
    temperature: 0.3,
    maxTokens: 1024,
    systemPrompt: `Anda adalah AI Webinar Analyst profesional. Output JSON berisi rating, ringkasan, poin_positif, area_peningkatan. Bahasa Indonesia profesional.`,
    userPrompt: `Berikut data CSV feedback peserta webinar:\n\n\`\`\`csv\n${feedbackData}\n\`\`\``,
  });
  return { ...output, participantCount };
}

// GET /api/v1/analyses
analyses.get('/', async (c) => {
  const list = await analysisRepo.findAll();
  return c.json({ analyses: list });
});

// GET /api/v1/analyses/:id
analyses.get('/:id', async (c) => {
  const analysis = await analysisRepo.findById(c.req.param('id'));
  if (!analysis) return c.json({ error: 'Analysis not found' }, 404);
  return c.json({ analysis });
});

// POST /api/v1/analyses
analyses.post('/', async (c) => {
  const session: SessionPayload | null = c.get('session');
  const body = await c.req.json<{
    webinarTitle: string; webinarDate?: string; uniqueIdentifier?: string;
    prospects?: any[]; analysis?: any;
  }>();

  const result = await analysisRepo.create({
    ...body,
    createdBy: session?.uid,
  });

  return c.json({ analysis: result }, 201);
});

// POST /api/v1/analyses/webinar — process webinar CSV and save prospects
analyses.post('/webinar', async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const body = z.object({
    webinarTitle: z.string().min(1),
    webinarDate: z.string(),
    feedbackData: z.string().min(1),
  }).parse(await c.req.json());

  const uniqueIdentifier = crypto.createHash('md5').update(`${body.webinarTitle}-${body.webinarDate}-${body.feedbackData}`).digest('hex');
  const duplicate = await analysisRepo.findByUniqueIdentifier(uniqueIdentifier);
  if (duplicate) return c.json({ success: false, error: 'Kombinasi file CSV ini sudah pernah dianalisis. Silakan cek di tab Riwayat & Prospek.' });

  const parsedRows = csvRows(body.feedbackData);
  if (parsedRows.length === 0) return c.json({ success: false, error: 'Data Feedback kosong atau tidak valid.' });
  const feedbackCsv = csvUnparse(parsedRows);
  const prospects = await generateProspects(feedbackCsv, body.webinarTitle);
  const analysis = await analysisRepo.create({
    webinarTitle: body.webinarTitle,
    webinarDate: new Date(body.webinarDate).toISOString(),
    uniqueIdentifier,
    createdBy: session.uid,
    prospects,
    analysis: { insights: null, topicRecommendation: null, mergedData: feedbackCsv },
  });

  return c.json({ success: true, analysisId: analysis.id, ...analysis });
});

// DELETE /api/v1/analyses/:id
analyses.delete('/:id', async (c) => {
  await analysisRepo.deleteById(c.req.param('id'));
  return c.json({ success: true });
});

// POST /api/v1/analyses/:id/assign-prospects
analyses.post('/:id/assign-prospects', async (c) => {
  const session = c.get('session');
  if (!session) return c.json({ error: 'Unauthorized' }, 401);
  const analysisId = c.req.param('id');
  const { prospects, salesId, salesName } = z.object({
    prospects: z.array(z.any()),
    salesId: z.string(),
    salesName: z.string(),
  }).parse(await c.req.json());

  const analysis = await analysisRepo.findById(analysisId);
  if (!analysis) return c.json({ error: 'Analysis not found' }, 404);

  for (const p of prospects) {
    await customerRepo.create({
      name: p.name || 'Unknown',
      email: p.email || '',
      phone: p.phone || '',
      company: p.company || '',
      jobTitle: p.jobTitle || '',
      products: [],
      assignedSalesId: salesId,
      assignedSalesName: salesName,
      pipelineStatus: 'Leads Generation 10%',
      webinarHistory: [{ webinarId: analysisId, webinarTitle: analysis.webinarTitle }],
      notes: { manual: `Prospek dari webinar "${analysis.webinarTitle}".\nKonteks: ${p.hook_chat || ''}` },
      team: session.team,
      acquisitionContext: { source: 'Webinar', eventName: analysis.webinarTitle, eventDate: analysis.webinarDate || new Date().toISOString() },
    });
  }

  const assignedHooks = new Set(prospects.map((p: any) => p.hook_chat));
  const updatedProspects = (analysis.prospects || []).map((p: any) => assignedHooks.has(p.hook_chat) ? { ...p, assignedSalesId: salesId, assignedSalesName: salesName } : p);
  await analysisRepo.update(analysisId, { prospects: updatedProspects });
  return c.json({ success: true, count: prospects.length });
});

// POST /api/v1/analyses/:id/topics
analyses.post('/:id/topics', async (c) => {
  const analysis = await analysisRepo.findById(c.req.param('id'));
  if (!analysis) return c.json({ success: false, error: 'Analisis tidak ditemukan.' }, 404);
  const mergedData = (analysis.analysis as any)?.mergedData;
  if (!mergedData) return c.json({ success: false, error: 'Data analisis tidak lengkap untuk menghasilkan rekomendasi topik.' });
  const topicRecommendation = await recommendTopics(mergedData, analysis.webinarTitle);
  await analysisRepo.update(analysis.id, { analysis: { ...analysis.analysis, topicRecommendation }, topicsGenerated: true });
  return c.json({ success: true, recommendations: topicRecommendation.recommendations });
});

// POST /api/v1/analyses/:id/insights
analyses.post('/:id/insights', async (c) => {
  const analysis = await analysisRepo.findById(c.req.param('id'));
  if (!analysis) return c.json({ success: false, error: 'Analisis tidak ditemukan.' }, 404);
  const mergedData = (analysis.analysis as any)?.mergedData;
  if (!mergedData) return c.json({ success: false, error: 'Data gabungan tidak ditemukan dalam analisis untuk menghasilkan ringkasan.' });
  const insights = await analyzeFeedback(mergedData);
  await analysisRepo.update(analysis.id, { analysis: { ...analysis.analysis, insights }, insightsGenerated: true });
  return c.json({ success: true, insights });
});

// PATCH /api/v1/analyses/:id
analyses.patch('/:id', async (c) => {
  const body = await c.req.json<{
    prospects?: any[]; analysis?: any;
    topicsGenerated?: boolean; insightsGenerated?: boolean;
  }>();

  await analysisRepo.update(c.req.param('id'), body);
  return c.json({ success: true });
});

// DELETE /api/v1/analyses
analyses.delete('/', async (c) => {
  const { uniqueIdentifier } = await c.req.json<{ uniqueIdentifier: string }>();
  await analysisRepo.deleteByUniqueIdentifier(uniqueIdentifier);
  return c.json({ success: true });
});

export { analyses };
