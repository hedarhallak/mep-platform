-- Section 67 / Section 65 P1 (May 4, 2026) — fix the project_foremen schema.
--
-- Discovered in Section 65 Phase 2a: the route POST /api/project-foremen
-- 500'd in CI with `null value in column "foreman_employee_id" violates
-- not-null constraint`. Same bug class as Bug 6 (Section 18) and Bug 8
-- (Section 19): legacy NOT NULL column the route never populates.
--
-- Current state (broken):
--   - PRIMARY KEY on (project_id) alone — incompatible with multi-trade
--     semantics that the route already implements via ON CONFLICT
--     (project_id, trade_code).
--   - foreman_employee_id bigint NOT NULL — legacy column from the old
--     single-foreman-per-project model. The route INSERT writes
--     (project_id, employee_id, trade_code, company_id) and never sets it.
--   - employee_id integer (nullable), trade_code varchar(50) (nullable),
--     company_id integer (nullable) — the new model's columns, but with
--     the wrong nullability.
--   - 5 indexes; 2 reference foreman_employee_id and become orphans after
--     the column drop.
--
-- Target state:
--   - PRIMARY KEY on (project_id, trade_code) — matches route's ON CONFLICT.
--   - foreman_employee_id column dropped (with its FK + 2 indexes).
--   - employee_id, trade_code, company_id all NOT NULL.
--
-- Production data: the route's POST always 500'd, so prod likely has zero
-- rows in this table. The backfill steps below are defensive — they make
-- the migration safe even if seed/manual rows exist.

BEGIN;

-- 1. Backfill: copy foreman_employee_id → employee_id where the new column
--    is null (legacy single-foreman rows).
UPDATE public.project_foremen
   SET employee_id = foreman_employee_id
 WHERE employee_id IS NULL
   AND foreman_employee_id IS NOT NULL;

-- 2. Backfill: assign a synthetic unique trade_code to legacy rows that
--    have NULL trade_code. Uses ctid (always unique within a table) as a
--    suffix to guarantee no PK collision after step 6.
UPDATE public.project_foremen
   SET trade_code = 'LEGACY-' || ctid::text
 WHERE trade_code IS NULL;

-- 3. Backfill: derive company_id from the project (multi-tenancy guarantee).
UPDATE public.project_foremen pf
   SET company_id = p.company_id
  FROM public.projects p
 WHERE pf.project_id = p.id
   AND pf.company_id IS NULL;

-- 4. Drop the legacy column + its FK constraint + its 2 indexes.
ALTER TABLE public.project_foremen
  DROP CONSTRAINT IF EXISTS project_foremen_foreman_employee_id_fkey;

DROP INDEX IF EXISTS public.idx_project_foremen_foreman;
DROP INDEX IF EXISTS public.idx_project_foremen_foreman_active;

ALTER TABLE public.project_foremen
  DROP COLUMN IF EXISTS foreman_employee_id;

-- 5. Lock down the new model's required columns. After backfill (steps 1-3)
--    these should all be populated for any existing row.
ALTER TABLE public.project_foremen
  ALTER COLUMN employee_id SET NOT NULL,
  ALTER COLUMN trade_code  SET NOT NULL,
  ALTER COLUMN company_id  SET NOT NULL;

-- 6. Swap the PRIMARY KEY: drop the old single-column PK, drop the now-
--    redundant UNIQUE on (project_id, trade_code), and make the same
--    pair the new PK.
ALTER TABLE public.project_foremen
  DROP CONSTRAINT IF EXISTS project_foremen_pkey;

ALTER TABLE public.project_foremen
  DROP CONSTRAINT IF EXISTS project_foremen_project_id_trade_code_key;

ALTER TABLE public.project_foremen
  ADD CONSTRAINT project_foremen_pkey PRIMARY KEY (project_id, trade_code);

COMMIT;
