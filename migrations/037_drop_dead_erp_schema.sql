-- ============================================================================
-- Migration 037: Drop the dead `erp` schema
-- ----------------------------------------------------------------------------
-- Background:
--   The schema baseline captured on 2026-04-26 revealed a second schema
--   `erp` alongside `public`, containing:
--     - 4 tables: employees, projects, employee_projects, work_logs
--     - 2 views: v_active_work_sessions, v_latest_work_location
--     - 2 functions: haversine_km, tg_set_updated_at
--     - Indexes + triggers
--
--   Investigation:
--     - Codebase grep across routes/, lib/, middleware/, services/, jobs/,
--       scripts/, mep-frontend/src/, and index.js found ZERO references
--       to anything `erp.*`.
--     - All 4 tables are empty (0 rows) on production.
--     - The schema looks like an abandoned earlier prototype: single-tenant
--       (no company_id), simpler shape, separate model from `public.*`.
--
--   Decision (Hedar, 2026-04-26): drop the entire schema.
--
-- Safety:
--   Wrapped in a transaction. A pre-check verifies all tables are still
--   empty (in case anything was inserted since the baseline snapshot);
--   if any rows exist, the migration aborts and rolls back without
--   touching anything.
-- ============================================================================

BEGIN;

-- Defense in depth: bail if any erp.* table somehow got data since baseline
DO $$
DECLARE
  emp_count   BIGINT;
  proj_count  BIGINT;
  work_count  BIGINT;
  ep_count    BIGINT;
  total_rows  BIGINT;
BEGIN
  SELECT COUNT(*) INTO emp_count  FROM erp.employees;
  SELECT COUNT(*) INTO proj_count FROM erp.projects;
  SELECT COUNT(*) INTO work_count FROM erp.work_logs;
  SELECT COUNT(*) INTO ep_count   FROM erp.employee_projects;
  total_rows := emp_count + proj_count + work_count + ep_count;

  IF total_rows > 0 THEN
    RAISE EXCEPTION
      'Cannot drop erp schema: contains data. employees=%, projects=%, work_logs=%, employee_projects=%. Migration aborted.',
      emp_count, proj_count, work_count, ep_count;
  END IF;
END $$;

-- Drop the entire schema (CASCADE removes tables, views, sequences,
-- functions, triggers, indexes — everything contained in the schema)
DROP SCHEMA erp CASCADE;

-- Verification: erp schema should no longer exist
SELECT
  schema_name,
  CASE WHEN COUNT(*) OVER () = 0 THEN 'erp schema dropped successfully'
       ELSE 'WARNING: erp schema still present'
  END AS status
FROM information_schema.schemata
WHERE schema_name = 'erp';

COMMIT;
