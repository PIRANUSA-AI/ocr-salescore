/**
 * Firestore → Postgres migration script.
 *
 * Reads every document from each Firestore collection and upserts
 * it into the matching Postgres table.  Idempotent — safe to re-run.
 *
 * Usage from repo root:
 *   npx tsx apps/backend/scripts/migrate-from-firestore.ts
 *
 * Reads env from apps/frontend/.env.local automatically.
 */
import { config as dotenvCfg } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import pg from 'pg';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const __scriptDir = dirname(fileURLToPath(import.meta.url));
dotenvCfg({ path: resolve(__scriptDir, '..', '.env') });
dotenvCfg({ path: resolve(__scriptDir, '..', '..', '..', 'apps', 'frontend', '.env.local') });
dotenvCfg({ path: resolve(__scriptDir, '..', '..', '..', '.env') });

// ─── Postgres pool ──────────────────────────────────
const pool = new pg.Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'salescore',
  password: process.env.PGPASSWORD || 'salescore_pass',
  database: process.env.PGDATABASE || 'salescore',
  max: 10,
});

async function pgQuery(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}
async function pgClose() { await pool.end(); }

// ─── Firebase Admin init ─────────────────────────────
const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is required');

const json = JSON.parse(Buffer.from(b64.trim(), 'base64').toString('utf-8'));
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ credential: cert(json) });
const firestore = getFirestore(app);

// ─── Helpers ─────────────────────────────────────────
function toISO(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'string') return val;
  return new Date().toISOString();
}
function safeNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? fallback : n;
}
const DEFAULT_PASSWORD_HASH = '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W';

let migrated = 0;
let skipped = 0;

async function migrateCollection<T extends Record<string, any>>(
  collection: string, table: string,
  transform: (docId: string, data: Record<string, any>) => T,
  upsertSQL: string,
  batchSize = 500,
) {
  const snap = await firestore.collection(collection).get();
  console.log(`\n📦 ${collection} → ${table}: ${snap.size} docs`);

  const docs: T[] = [];
  for (const doc of snap.docs) {
    try {
      docs.push(transform(doc.id, { ...doc.data() }));
    } catch (e: any) {
      console.warn(`  ⚠️  Skip ${doc.id}: ${e.message}`);
      skipped++;
    }
  }

  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    for (const row of batch) {
      try {
        await pgQuery(upsertSQL, Object.values(row));
        migrated++;
      } catch (e: any) {
        console.warn(`  ⚠️  Insert failed: ${e.message.slice(0, 120)}`);
        skipped++;
      }
    }
  }
  console.log(`  ✅ ${docs.length} processed`);
}

// ─── Collection migrations ───────────────────────────

async function migrateUsers() {
  await migrateCollection('users', 'users',
    (id, d) => ({
      id, name: d.name || '', email: (d.email || '').toLowerCase().trim(),
      password_hash: DEFAULT_PASSWORD_HASH, role: d.role || 'Sales', team: d.team || 'AEC',
      photo_url: d.photoURL || d.photo_url || null,
      sales_code: d.salesCode || d.sales_code || null,
      leader_id: d.leaderId || d.leader_id || null,
      created_at: toISO(d.createdAt || d.created_at), updated_at: toISO(d.updatedAt || d.updated_at),
    }),
    `INSERT INTO users (id,name,email,password_hash,role,team,photo_url,sales_code,leader_id,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,role=EXCLUDED.role,
       team=EXCLUDED.team,photo_url=EXCLUDED.photo_url,sales_code=EXCLUDED.sales_code,
       leader_id=EXCLUDED.leader_id,updated_at=EXCLUDED.updated_at`);
}

async function migrateCustomers() {
  await migrateCollection('customers', 'customers',
    (id, d) => ({
      id, name: d.name || '', email: d.email || '', phone: d.phone || '',
      company: d.company || '', job_title: d.jobTitle || d.job_title || '',
      team: d.team || 'AEC', address: d.address || null,
      pipeline_status: d.pipelineStatus || d.pipeline_status || 'Leads Generation 10%',
      assigned_sales_id: d.assignedSalesId || d.assigned_sales_id || null,
      assigned_sales_name: d.assignedSalesName || d.assigned_sales_name || null,
      potential_revenue: d.potentialRevenue ?? d.potential_revenue ?? null,
      acquisition_context: JSON.stringify(d.acquisitionContext || {}),
      products: JSON.stringify(d.products || []),
      form_answers: JSON.stringify(d.formAnswers || d.form_answers || []),
      webinar_history: JSON.stringify(d.webinarHistory || d.webinar_history || []),
      notes: JSON.stringify(d.notes || {}),
      generation_history: JSON.stringify(d.generationHistory || d.generation_history || []),
      image_url: d.imageUrl || d.image_url || null, image_key: d.imageKey || d.image_key || null,
      created_at: toISO(d.createdAt || d.created_at), updated_at: toISO(d.updatedAt || d.updated_at),
    }),
    `INSERT INTO customers(id,name,email,phone,company,job_title,team,address,
       pipeline_status,assigned_sales_id,assigned_sales_name,potential_revenue,
       acquisition_context,products,form_answers,webinar_history,notes,
       generation_history,image_url,image_key,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,
       phone=EXCLUDED.phone,company=EXCLUDED.company,job_title=EXCLUDED.job_title,
       team=EXCLUDED.team,address=EXCLUDED.address,
       pipeline_status=EXCLUDED.pipeline_status,
       assigned_sales_id=EXCLUDED.assigned_sales_id,
       assigned_sales_name=EXCLUDED.assigned_sales_name,
       potential_revenue=EXCLUDED.potential_revenue,
       acquisition_context=EXCLUDED.acquisition_context,
       products=EXCLUDED.products,form_answers=EXCLUDED.form_answers,
       webinar_history=EXCLUDED.webinar_history,notes=EXCLUDED.notes,
       generation_history=EXCLUDED.generation_history,
       image_url=EXCLUDED.image_url,image_key=EXCLUDED.image_key,
       updated_at=EXCLUDED.updated_at`);
}

async function migrateOcrJobs() {
  await migrateCollection('jobs', 'ocr_jobs',
    (id, d) => ({
      id, user_id: d.userId || d.user_id || '', status: d.status || 'pending',
      image_url: d.imageUrl || d.image_url || null,
      result: d.result ? JSON.stringify(d.result) : null,
      error_message: d.error || d.error_message || null,
      created_at: toISO(d.createdAt || d.created_at), updated_at: toISO(d.updatedAt || d.updated_at),
    }),
    `INSERT INTO ocr_jobs(id,user_id,status,image_url,result,error_message,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,status=EXCLUDED.status,
       image_url=EXCLUDED.image_url,result=EXCLUDED.result,
       error_message=EXCLUDED.error_message,updated_at=EXCLUDED.updated_at`);
}

async function migrateAnalyses() {
  await migrateCollection('analyses', 'analyses',
    (id, d) => ({
      id, webinar_title: d.webinarTitle || d.webinar_title || '',
      webinar_date: d.webinarDate || d.webinar_date || null,
      unique_identifier: d.uniqueIdentifier || d.unique_identifier || null,
      created_by: d.createdBy || d.created_by || null,
      prospects: JSON.stringify(d.prospects || []), analysis: JSON.stringify(d.analysis || {}),
      topics_generated: !!d.topicsGenerated || !!d.topics_generated,
      insights_generated: !!d.insightsGenerated || !!d.insights_generated,
      created_at: toISO(d.createdAt || d.created_at), updated_at: toISO(d.updatedAt || d.updated_at),
    }),
    `INSERT INTO analyses(id,webinar_title,webinar_date,unique_identifier,created_by,
       prospects,analysis,topics_generated,insights_generated,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(id) DO UPDATE SET webinar_title=EXCLUDED.webinar_title,
       webinar_date=EXCLUDED.webinar_date,unique_identifier=EXCLUDED.unique_identifier,
       created_by=EXCLUDED.created_by,prospects=EXCLUDED.prospects,
       analysis=EXCLUDED.analysis,topics_generated=EXCLUDED.topics_generated,
       insights_generated=EXCLUDED.insights_generated,updated_at=EXCLUDED.updated_at`);
}

async function migrateActivityLogs() {
  const snap = await firestore.collection('activityLogs').get();
  console.log(`\n📦 activityLogs → activity_logs: ${snap.size} docs`);
  for (const doc of snap.docs) {
    const d = doc.data();
    try {
      await pgQuery(
        `INSERT INTO activity_logs(actor_id,actor_name,action,target_id,target_name,created_at)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [d.actorId || d.actor_id || '', d.actorName || d.actor_name || '',
         d.action || '', d.targetId || d.target_id || '', d.targetName || d.target_name || '',
         toISO(d.createdAt || d.created_at)],
      );
      migrated++;
    } catch (e: any) {
      console.warn(`  ⚠️  Skip ${doc.id}: ${e.message.slice(0, 80)}`);
      skipped++;
    }
  }
  console.log(`  ✅ done`);
}

async function migrateNotifications() {
  await migrateCollection('notifications', 'notifications',
    (id, d) => ({
      id, user_id: d.userId || d.user_id || '', title: d.title || '',
      message: d.message || '', type: d.type || 'info',
      is_read: !!d.isRead || !!d.is_read, link: d.link || null,
      related_id: d.relatedId || d.related_id || null,
      created_at: toISO(d.createdAt || d.created_at),
    }),
    `INSERT INTO notifications(id,user_id,title,message,type,is_read,link,related_id,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,title=EXCLUDED.title,
       message=EXCLUDED.message,type=EXCLUDED.type,is_read=EXCLUDED.is_read,
       link=EXCLUDED.link,related_id=EXCLUDED.related_id`);
}

async function migrateEmailBlasts() {
  await migrateCollection('email_blasts', 'email_blasts',
    (id, d) => ({
      id, subject: d.subject || '', content: d.content || '',
      recipient_filter: JSON.stringify({ recipients: d.recipients || [], emailType: d.emailType || null }),
      sent_count: safeNumber(d.recipientCount || d.sent_count),
      click_count: safeNumber(d.clickCount || d.click_count),
      status: d.status || (d.sentAt ? 'sent' : 'draft'),
      created_by: d.sentBy || d.created_by || d.createdBy || null,
      created_at: toISO(d.sentAt || d.createdAt || d.created_at),
      updated_at: toISO(d.updatedAt || d.updated_at),
    }),
    `INSERT INTO email_blasts(id,subject,content,recipient_filter,sent_count,click_count,status,created_by,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT(id) DO UPDATE SET subject=EXCLUDED.subject,content=EXCLUDED.content,
       recipient_filter=EXCLUDED.recipient_filter,sent_count=EXCLUDED.sent_count,
       click_count=EXCLUDED.click_count,status=EXCLUDED.status,
       created_by=EXCLUDED.created_by,updated_at=EXCLUDED.updated_at`);
}

async function migrateMediaAssets() {
  await migrateCollection('mediaAssets', 'media_assets',
    (id, d) => ({
      id, asset_name: d.assetName || d.asset_name || '',
      file_name: d.fileName || d.file_name || '', image_url: d.imageUrl || d.image_url || '',
      uploaded_by: JSON.stringify(d.uploadedBy || {}), tags: JSON.stringify(d.tags || []),
      created_at: toISO(d.createdAt || d.created_at),
    }),
    `INSERT INTO media_assets(id,asset_name,file_name,image_url,uploaded_by,tags,created_at)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT(id) DO UPDATE SET asset_name=EXCLUDED.asset_name,
       file_name=EXCLUDED.file_name,image_url=EXCLUDED.image_url,
       uploaded_by=EXCLUDED.uploaded_by,tags=EXCLUDED.tags`);
}

async function migrateCompanies() {
  await migrateCollection('companies', 'companies',
    (id, d) => ({
      id, name: d.name || '', website: d.website || null,
      industry: d.industry || null, employee_count: d.employeeCount || d.employee_count || null,
      address: d.address || null,
      tech_stack: JSON.stringify(d.techStack || d.tech_stack || []),
      potential_tier: d.potentialTier || d.potential_tier || 'SMB',
      key_projects: JSON.stringify(d.keyProjects || d.key_projects || []),
      last_analysis_date: d.lastAnalysisDate || d.last_analysis_date || null,
      summary: d.summary || '', risk_assessment: d.riskAssessment || d.risk_assessment || null,
      created_at: toISO(d.createdAt || d.created_at), updated_at: toISO(d.updatedAt || d.updated_at),
    }),
    `INSERT INTO companies(id,name,website,industry,employee_count,address,
       tech_stack,potential_tier,key_projects,last_analysis_date,summary,risk_assessment,created_at,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,website=EXCLUDED.website,
       industry=EXCLUDED.industry,employee_count=EXCLUDED.employee_count,
       address=EXCLUDED.address,tech_stack=EXCLUDED.tech_stack,
       potential_tier=EXCLUDED.potential_tier,key_projects=EXCLUDED.key_projects,
       last_analysis_date=EXCLUDED.last_analysis_date,summary=EXCLUDED.summary,
       risk_assessment=EXCLUDED.risk_assessment,updated_at=EXCLUDED.updated_at`);
}

async function migrateSystemQuotas() {
  await migrateCollection('system_quotas', 'system_quotas',
    (id, d) => ({
      id, daily_used: safeNumber(d.dailyUsed || d.daily_used),
      monthly_used: safeNumber(d.monthlyUsed || d.monthly_used),
      last_reset_date: d.lastResetDate || d.last_reset_date || new Date().toISOString().slice(0, 10),
    }),
    `INSERT INTO system_quotas(id,daily_used,monthly_used,last_reset_date)
     VALUES($1,$2,$3,$4)
     ON CONFLICT(id) DO UPDATE SET daily_used=EXCLUDED.daily_used,
       monthly_used=EXCLUDED.monthly_used,last_reset_date=EXCLUDED.last_reset_date`);
}

async function migrateFeatureFlags() {
  await migrateCollection('featureFlags', 'feature_flags',
    (id, d) => ({
      id, name: d.name || id, description: d.description || '',
      is_enabled: !!d.isEnabled || !!d.is_enabled,
      updated_at: toISO(d.updatedAt || d.updated_at),
    }),
    `INSERT INTO feature_flags(id,name,description,is_enabled,updated_at)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,
       is_enabled=EXCLUDED.is_enabled,updated_at=EXCLUDED.updated_at`);

  // Also migrate appConfig (if exists) into feature_flags
  try {
    const snap = await firestore.collection('appConfig').get();
    if (!snap.empty) {
      for (const doc of snap.docs) {
        const d = doc.data();
        await pgQuery(
          `INSERT INTO feature_flags(id,name,description,is_enabled,updated_at)
           VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(id) DO UPDATE SET
           name=EXCLUDED.name,description=EXCLUDED.description,is_enabled=EXCLUDED.is_enabled`,
          [doc.id, doc.id, '', !!d.maintenance],
        );
        migrated++;
      }
      console.log(`  → appConfig: ${snap.size} migrated to feature_flags`);
    }
  } catch { /* appConfig may not exist */ }
}

// ─── Main ────────────────────────────────────────────
async function main() {
  console.log('🔥 Firestore → Postgres Migration');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  const start = Date.now();

  await migrateUsers();
  await migrateCustomers();
  await migrateOcrJobs();
  await migrateAnalyses();
  await migrateActivityLogs();
  await migrateNotifications();
  await migrateEmailBlasts();
  await migrateMediaAssets();
  await migrateCompanies();
  await migrateSystemQuotas();
  await migrateFeatureFlags();

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped:  ${skipped}`);

  await pgClose();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  pgClose();
  process.exit(1);
});
