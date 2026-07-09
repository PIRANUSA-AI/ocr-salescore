-- SalesCore Backend — Initial Postgres Schema
-- Run: psql -h 127.0.0.1 -U salescore -d salescore -f db/001_initial.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users (replaces Firestore `users` + MySQL `app_users`) ─────────
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('Leader','Sales','Superadmin')),
  team          VARCHAR(10)  NOT NULL CHECK (team IN ('AEC','MFG')),
  photo_url     TEXT,
  sales_code    VARCHAR(8),
  leader_id     VARCHAR(64)  REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (email)
);

-- ─── Customers (replaces Firestore `customers`) ─────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                 VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name               VARCHAR(255) NOT NULL,
  email              VARCHAR(255),
  phone              VARCHAR(50),
  company            VARCHAR(255),
  job_title          VARCHAR(255),
  team               VARCHAR(10)  NOT NULL CHECK (team IN ('AEC','MFG')),
  address            TEXT,
  pipeline_status    VARCHAR(50)  NOT NULL DEFAULT 'Leads Generation 10%',
  assigned_sales_id  VARCHAR(64)  REFERENCES users(id) ON DELETE SET NULL,
  assigned_sales_name VARCHAR(150),
  potential_revenue  NUMERIC(12,2),
  acquisition_context JSONB       NOT NULL DEFAULT '{}',
  products           JSONB        NOT NULL DEFAULT '[]',
  form_answers       JSONB        NOT NULL DEFAULT '[]',
  webinar_history    JSONB        NOT NULL DEFAULT '[]',
  notes              JSONB        NOT NULL DEFAULT '{}',
  generation_history JSONB        NOT NULL DEFAULT '[]',
  image_url          TEXT,
  image_key          TEXT,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_team ON customers(team);
CREATE INDEX IF NOT EXISTS idx_customers_assigned_sales ON customers(assigned_sales_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- ─── OCR Jobs (replaces Firestore `jobs`) ───────────────────────────
CREATE TABLE IF NOT EXISTS ocr_jobs (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id       VARCHAR(64)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','processing','done','error')),
  image_url     TEXT,
  result        JSONB,
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ocr_jobs_user ON ocr_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs(status);

-- ─── Analyses (replaces Firestore `analyses`) ───────────────────────
CREATE TABLE IF NOT EXISTS analyses (
  id                 VARCHAR(64) NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  webinar_title      VARCHAR(255) NOT NULL,
  webinar_date       DATE,
  unique_identifier  VARCHAR(255),
  created_by         VARCHAR(64)  REFERENCES users(id) ON DELETE SET NULL,
  prospects          JSONB        NOT NULL DEFAULT '[]',
  analysis           JSONB        NOT NULL DEFAULT '{}',
  topics_generated   BOOLEAN      NOT NULL DEFAULT FALSE,
  insights_generated BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analyses_identifier ON analyses(unique_identifier);

-- ─── Activity Logs (replaces Firestore `activityLogs`) ──────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id           BIGSERIAL    PRIMARY KEY,
  actor_id     VARCHAR(64)  NOT NULL,
  actor_name   VARCHAR(150) NOT NULL,
  action       TEXT         NOT NULL,
  target_id    VARCHAR(64)  NOT NULL,
  target_name  VARCHAR(255) NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_target ON activity_logs(target_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_actor ON activity_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at DESC);

-- ─── Notifications (replaces Firestore `notifications`) ─────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      VARCHAR(64)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  message      TEXT         NOT NULL,
  type         VARCHAR(20)  NOT NULL DEFAULT 'info'
               CHECK (type IN ('info','success','warning','error','deal_won','assignment')),
  is_read      BOOLEAN      NOT NULL DEFAULT FALSE,
  link         TEXT,
  related_id   VARCHAR(64),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- ─── Email Blasts (replaces Firestore `email_blasts`) ───────────────
CREATE TABLE IF NOT EXISTS email_blasts (
  id               VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subject          VARCHAR(255) NOT NULL,
  content          TEXT         NOT NULL,
  recipient_filter JSONB        NOT NULL DEFAULT '{}',
  sent_count       INTEGER      NOT NULL DEFAULT 0,
  click_count      INTEGER      NOT NULL DEFAULT 0,
  status           VARCHAR(10)  NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','sent')),
  created_by       VARCHAR(64)  REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Media Assets (replaces Firestore `mediaAssets`) ────────────────
CREATE TABLE IF NOT EXISTS media_assets (
  id           VARCHAR(64)  NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_name   VARCHAR(255) NOT NULL,
  file_name    TEXT         NOT NULL,
  image_url    TEXT         NOT NULL,
  uploaded_by  JSONB        NOT NULL DEFAULT '{}',
  tags         JSONB        NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Companies (replaces Firestore `companies`) ─────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                VARCHAR(64)  NOT NULL PRIMARY KEY,
  name              VARCHAR(255) NOT NULL,
  website           TEXT,
  industry          VARCHAR(100),
  employee_count    VARCHAR(50),
  address           TEXT,
  tech_stack        JSONB        NOT NULL DEFAULT '[]',
  potential_tier    VARCHAR(20)  NOT NULL DEFAULT 'SMB'
                    CHECK (potential_tier IN ('Enterprise','SMB','Startup')),
  key_projects      JSONB        NOT NULL DEFAULT '[]',
  last_analysis_date TIMESTAMPTZ,
  summary           TEXT         NOT NULL DEFAULT '',
  risk_assessment   TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── System Quotas (replaces Firestore `system_quotas`) ─────────────
CREATE TABLE IF NOT EXISTS system_quotas (
  id              VARCHAR(64) NOT NULL PRIMARY KEY,
  daily_used      INTEGER     NOT NULL DEFAULT 0,
  monthly_used    INTEGER     NOT NULL DEFAULT 0,
  last_reset_date DATE        NOT NULL DEFAULT CURRENT_DATE
);

-- ─── Feature Flags (replaces Firestore `featureFlags` + `appConfig`) ─
CREATE TABLE IF NOT EXISTS feature_flags (
  id          VARCHAR(64) NOT NULL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  is_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO feature_flags (id, name, description, is_enabled) VALUES
  ('webinar', 'Webinar Analysis', 'Enable webinar analysis feature', TRUE),
  ('renewal', 'Renewal Tracking', 'Enable renewal tracking feature', TRUE),
  ('aftersales', 'Aftersales', 'Enable aftersales feature', TRUE),
  ('opportunity', 'Opportunity Detection', 'Enable opportunity detection', TRUE),
  ('update', 'Update Tracking', 'Enable update tracking', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ─── Tasks (migrated from MySQL `user_tasks`, for To-Do feature) ────
CREATE TABLE IF NOT EXISTS tasks (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          VARCHAR(64)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name        VARCHAR(150) NOT NULL,
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  status           VARCHAR(10)  NOT NULL DEFAULT 'todo'
                   CHECK (status IN ('todo','done')),
  priority         VARCHAR(10)  NOT NULL DEFAULT 'medium'
                   CHECK (priority IN ('low','medium','high')),
  source           VARCHAR(10)  NOT NULL DEFAULT 'self'
                   CHECK (source IN ('self','leader','ai')),
  assigned_by_id   VARCHAR(64)  REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_name VARCHAR(150),
  due_date         DATE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
