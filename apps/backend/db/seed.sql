-- SalesCore Backend — Seed data for local development
-- Run after 001_initial.sql:
--   docker exec -i salescore-pg psql -U salescore -d salescore < apps/backend/db/seed.sql

-- ─── Users (password for all: "password123") ────────────────────────
INSERT INTO users (id, name, email, password_hash, role, team) VALUES
  ('leader-001', 'Windy Pratama', 'windy@piranusa.com', '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Leader', 'AEC'),
  ('sales-A',    'Andi Saputra',  'andi@piranusa.com',  '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Sales',  'AEC'),
  ('sales-B',    'Bella Kusuma',  'bella@piranusa.com', '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Sales',  'AEC'),
  ('sales-C',    'Citra Dewi',    'citra@piranusa.com', '$2b$10$C6s.oZa86UA1eUV69lF5seia0xroUrrC8rUEVWgeCO/oftgu/Gu4W', 'Sales',  'MFG')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- ─── Sample customer ───────────────────────────────────────────────
INSERT INTO customers (id, name, email, phone, company, job_title, team, pipeline_status, acquisition_context) VALUES
  ('sample-cust-001', 'Budi Hartono', 'budi@example.com', '08123456789', 'PT Maju Jaya', 'Direktur Utama', 'AEC', 'Leads Generation 10%',
   '{"source":"Webinar","eventName":"MFI 2025","eventDate":"2026-06-15"}')
ON CONFLICT (id) DO NOTHING;
