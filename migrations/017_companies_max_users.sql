-- ============================================================================
-- 017_companies_max_users.sql
--
-- Section 113 (May 16, 2026) — D3 static seat-cap. Adds the per-tenant
-- maximum-user count column to public.companies + backfills existing rows
-- based on their current `plan` value.
--
-- Background and scope decision: see DECISIONS.md Section 113 (entire
-- section). Short version: this is the cheapest piece of the eventual
-- billing/subscription system (Phase 9-B, post-conference Q4 2026). It
-- exists so we can honestly tell a conference-demo audience "Constrai
-- enforces seat caps per plan" without lying or hand-waving — the
-- invite endpoint returns HTTP 402 USER_LIMIT_REACHED when the company
-- is at-cap, and the admin Branding page displays current_users / max_users.
-- The full Stripe-driven dynamic plan changes ship in Phase 9-B; this
-- migration is the column shape that Phase 9-B will continue to read.
--
-- Plan → max_users mapping (Section 113.6):
--   BASIC       → 5     ($49/mo target — 1-4 person shop)
--   PRO         → 25    ($149/mo target — 5-20 person crew)
--   ENTERPRISE  → 100   ($399/mo target — 20+ person company)
--   TRIAL       → 5     ($0, 14-day trial)
--   anything else → 5   (defensive — unknown plans fall back to BASIC cap)
--
-- The DEFAULT of 5 protects future INSERTs that omit the column from
-- silently creating an unlimited tenant. NOT NULL is enforced so the
-- application code can rely on Number(max_users) without a NULL check.
--
-- Index rationale: every employee-invite request reads max_users + a
-- correlated COUNT(*) of employees. Index avoids a sequential scan when
-- the companies table grows past a few thousand rows. Cheap insurance.
--
-- Rollback: 017_companies_max_users.rollback.sql drops the column. No
-- data preservation needed — max_users is derivable from plan.
-- ============================================================================

BEGIN;

-- Defensive sanity check — fail loudly if max_users already exists (e.g.,
-- manual cleanup between attempts). RAISE NOTICE not EXCEPTION so a
-- partial re-application doesn't abort the whole transaction; the
-- ADD COLUMN IF NOT EXISTS below is the actual idempotency.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'max_users'
  ) THEN
    RAISE NOTICE 'Migration 017: companies.max_users already exists — skipping ADD COLUMN; backfill will still run idempotently.';
  END IF;
END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 5;

-- Backfill existing rows based on current plan. Idempotent: re-running
-- this UPDATE on already-correct rows is a no-op at the row level
-- (Postgres still writes a new tuple version, which is fine — companies
-- is a tiny table).
UPDATE public.companies SET max_users = CASE
  WHEN plan = 'ENTERPRISE' THEN 100
  WHEN plan = 'PRO'        THEN 25
  WHEN plan = 'TRIAL'      THEN 5
  WHEN plan = 'BASIC'      THEN 5
  ELSE 5  -- unknown / NULL plan → conservative BASIC cap
END;

CREATE INDEX IF NOT EXISTS idx_companies_max_users
  ON public.companies(max_users);

COMMENT ON COLUMN public.companies.max_users IS
  'Seat cap enforced at invite time (routes/invite_employee.js returns HTTP 402 USER_LIMIT_REACHED when at-cap). Updated by Phase 9-B Stripe webhook when plan changes. See DECISIONS.md Section 113.';

-- Sanity check post-write.
DO $$
DECLARE
  null_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'companies'
       AND column_name  = 'max_users'
  ) THEN
    RAISE EXCEPTION 'Migration 017 abort: companies.max_users column was not created';
  END IF;

  SELECT COUNT(*) INTO null_count FROM public.companies WHERE max_users IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Migration 017 abort: % companies still have NULL max_users after backfill', null_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Post-migration manual verification (run after COMMIT to confirm):
-- ============================================================================
--
-- \d+ public.companies
-- -- Expect to see max_users (integer, NOT NULL, DEFAULT 5).
--
-- SELECT plan, COUNT(*), MIN(max_users) AS min_cap, MAX(max_users) AS max_cap
--   FROM public.companies
--   GROUP BY plan
--   ORDER BY plan;
-- -- Expect:
-- --   BASIC      → min/max cap = 5
-- --   PRO        → min/max cap = 25
-- --   ENTERPRISE → min/max cap = 100
-- --   TRIAL      → min/max cap = 5
--
-- SELECT indexname FROM pg_indexes
--  WHERE schemaname = 'public' AND tablename = 'companies' AND indexname = 'idx_companies_max_users';
-- -- Expect 1 row.
