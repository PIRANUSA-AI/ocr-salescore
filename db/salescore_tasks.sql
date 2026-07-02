-- db/salescore_tasks.sql
-- SalesCore "Task to Do" feature — MySQL schema + seed data.
-- Showcases the workflow: a Sales Leader assigns the FIRST task to each sales
-- rep; sales can then add their own tasks; the source column lets the AI /
-- dashboard distinguish leader-assigned vs self-created vs AI-generated tasks.
--
-- Load with:
--   mysql -h 127.0.0.1 -P 3307 -u salescore -psalescore_pass salescore < db/salescore_tasks.sql

CREATE DATABASE IF NOT EXISTS salescore
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE salescore;

-- ---------------------------------------------------------------------------
-- Lightweight sales-team roster. The main app authenticates via Firebase; this
-- table is a local reference so the To-Do feature (and the AI) knows who the
-- sales reps are and who their leader is, without touching Firebase.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id          VARCHAR(64)  NOT NULL PRIMARY KEY,   -- matches Firebase uid where available
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(190) NULL,
  role        ENUM('Leader','Sales','Superadmin') NOT NULL DEFAULT 'Sales',
  team        ENUM('AEC','MFG') NOT NULL DEFAULT 'AEC',
  sales_code  VARCHAR(8)   NULL,                    -- printed on the A5 OCR form (A, B, C ...)
  leader_id   VARCHAR(64)  NULL,                    -- FK-ish: which leader owns this rep
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sales_code (sales_code),
  KEY idx_role (role),
  KEY idx_leader (leader_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Per-user task list.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_tasks (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id        VARCHAR(64)  NOT NULL,             -- owner (the sales rep who must do it)
  user_name      VARCHAR(150) NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT NULL,
  status         ENUM('todo','done') NOT NULL DEFAULT 'todo',
  priority       ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  source         ENUM('self','leader','ai') NOT NULL DEFAULT 'self',
  assigned_by_id   VARCHAR(64)  NULL,               -- who created it (leader for onboarding tasks)
  assigned_by_name VARCHAR(150) NULL,
  due_date       DATE NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_user (user_id),
  KEY idx_user_status (user_id, status),
  KEY idx_source (source)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- SEED: one Leader + three Sales reps (AEC + MFG teams).
-- ---------------------------------------------------------------------------
INSERT INTO team_members (id, name, email, role, team, sales_code, leader_id) VALUES
  ('leader-001', 'Windy Pratama',  'windy@piranusa.com',  'Leader', 'AEC', NULL, NULL),
  ('sales-A',    'Andi Saputra',   'andi@piranusa.com',   'Sales',  'AEC', 'A', 'leader-001'),
  ('sales-B',    'Bella Kusuma',   'bella@piranusa.com',  'Sales',  'AEC', 'B', 'leader-001'),
  ('sales-C',    'Citra Dewi',     'citra@piranusa.com',  'Sales',  'MFG', 'C', 'leader-001')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------------
-- SEED: the Leader assigns each sales rep their FIRST task (source='leader').
-- This is the reference the AI uses to understand each rep's starting point.
-- ---------------------------------------------------------------------------
INSERT INTO user_tasks
  (user_id, user_name, title, description, priority, source, assigned_by_id, assigned_by_name, due_date)
VALUES
  ('sales-A', 'Andi Saputra',
   'Follow-up 5 leads pameran pertama',
   'Hubungi 5 lead hasil scan form pameran hari pertama. Catat hasil di CRM.',
   'high', 'leader', 'leader-001', 'Windy Pratama', CURRENT_DATE + INTERVAL 2 DAY),

  ('sales-B', 'Bella Kusuma',
   'Kualifikasi lead prioritas High',
   'Review semua lead dengan Prioritas Pelanggan = High, jadwalkan demo produk.',
   'high', 'leader', 'leader-001', 'Windy Pratama', CURRENT_DATE + INTERVAL 3 DAY),

  ('sales-C', 'Citra Dewi',
   'Rekap kebutuhan produk MFG',
   'Kelompokkan lead tim MFG berdasarkan kebutuhan software (2D/3D) untuk penawaran.',
   'medium', 'leader', 'leader-001', 'Windy Pratama', CURRENT_DATE + INTERVAL 4 DAY);

-- ---------------------------------------------------------------------------
-- Local auth fallback (used when Firebase is not configured).
-- Firebase code is kept intact; the app runs on this table until Firebase is
-- wired back in. `id` matches team_members so a rep's tasks link on login.
-- password_hash below is bcrypt of "password123" for every seed account.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  id            VARCHAR(64)  NOT NULL PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('Leader','Sales','Superadmin') NOT NULL DEFAULT 'Sales',
  team          ENUM('AEC','MFG') NOT NULL DEFAULT 'AEC',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_email (email)
) ENGINE=InnoDB;

INSERT INTO app_users (id, name, email, password_hash, role, team) VALUES
  ('leader-001', 'Windy Pratama', 'windy@piranusa.com', '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Leader', 'AEC'),
  ('sales-A',    'Andi Saputra',  'andi@piranusa.com',  '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Sales',  'AEC'),
  ('sales-B',    'Bella Kusuma',  'bella@piranusa.com', '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Sales',  'AEC'),
  ('sales-C',    'Citra Dewi',    'citra@piranusa.com', '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Sales',  'MFG')
ON DUPLICATE KEY UPDATE name = VALUES(name);
