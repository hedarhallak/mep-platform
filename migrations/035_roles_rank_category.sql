-- migrations/035_roles_rank_category.sql
--
-- Professional permissions — Phase 1a (data-driven roles foundation).
-- DECISIONS §148. Makes the `roles` table the single source of truth for the
-- role hierarchy by adding `rank` (the former hardcoded ROLE_LEVEL) + `category`
-- (UI grouping), and upserts the full canonical catalog. This lets the frontend
-- render roles from the DB instead of a hardcoded array, and lets us ADD a role
-- later as (eventually) a pure INSERT.
--
-- Scope of THIS migration = read-side foundation only. The write-side
-- `app_users_role_check` CHECK → FK(roles.role_key) swap is Phase 1b, kept
-- separate + verified because it touches the auth table (it must not reject any
-- existing app_users.role value).
--
-- GRANTs: none — `roles` is a baseline table (mepuser/mepuser_super already
-- granted); ADD COLUMN inherits. Idempotent: IF NOT EXISTS + ON CONFLICT.

BEGIN;

-- 1. Hierarchy metadata columns.
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS rank     INT;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS category TEXT;

-- 2. Canonical catalog. `rank` mirrors the former middleware/roles.js
--    ROLE_LEVEL exactly (no behavior change). `category` groups roles for the
--    matrix UI. ON CONFLICT keeps re-runs a clean no-op while normalizing
--    rank/category for rows that pre-existed (e.g. OWNER from migration 029).
INSERT INTO public.roles (role_key, label, rank, category, is_active) VALUES
  ('SUPER_ADMIN',           'Super Admin',     100, 'platform',   true),
  ('OWNER',                 'Owner',            95, 'governance', true),
  ('IT_ADMIN',              'IT Admin',         90, 'governance', true),
  ('COMPANY_ADMIN',         'Company Admin',    80, 'governance', true),
  ('TRADE_PROJECT_MANAGER', 'Project Manager',  60, 'management', true),
  ('TRADE_ADMIN',           'Trade Admin',      50, 'management', true),
  ('FOREMAN',               'Foreman',          40, 'supervision',true),
  ('JOURNEYMAN',            'Journeyman',        20, 'field',      true),
  ('APPRENTICE_4',          'Apprentice 4',      16, 'field',      true),
  ('APPRENTICE_3',          'Apprentice 3',      15, 'field',      true),
  ('APPRENTICE_2',          'Apprentice 2',      14, 'field',      true),
  ('APPRENTICE_1',          'Apprentice 1',      13, 'field',      true),
  ('WORKER',                'Worker',            10, 'field',      true),
  ('DRIVER',                'Driver',            10, 'field',      true)
ON CONFLICT (role_key) DO UPDATE
  SET rank     = EXCLUDED.rank,
      category = EXCLUDED.category,
      label    = COALESCE(public.roles.label, EXCLUDED.label),
      is_active = true;

COMMIT;
