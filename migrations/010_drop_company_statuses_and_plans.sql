-- Section 67/74 follow-up — Convert companies.status / companies.plan FK
-- constraints into inline CHECK constraints, then drop the 2 lookup tables.
--
-- Section 74 preserved `public.company_statuses` and `public.plans` because
-- they were live FK targets from the active `companies` table (status/plan
-- columns reference them via FK). At the time we deferred the cleanup
-- because dropping the FK without a replacement would downgrade schema
-- integrity. This migration ships the replacement: tighter inline CHECK
-- constraints with the same allowed values that the lookup tables enforced.
--
-- Allowed values come from tests/helpers/db.js (which is the only code
-- referencing these tables — the seeding done at test setup time):
--
--   public.plans.code            : 'BASIC', 'PRO', 'ENTERPRISE'
--   public.company_statuses.code : 'TRIAL', 'ACTIVE', 'PAST_DUE',
--                                  'SUSPENDED', 'CANCELLED'
--
-- The CHECK constraints below mirror those values exactly, so any
-- companies row that passed the FK before will pass the CHECK after.

BEGIN;

-- 1. Drop the existing FK constraints that point at the about-to-be-dropped tables.
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS fk_companies_status;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS fk_companies_plan;

-- 2. Add inline CHECK constraints with the same allowed values.
ALTER TABLE public.companies
  ADD CONSTRAINT chk_companies_status
  CHECK (status IN ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED'));

ALTER TABLE public.companies
  ADD CONSTRAINT chk_companies_plan
  CHECK (plan IN ('BASIC', 'PRO', 'ENTERPRISE'));

-- 3. Drop the now-orphan lookup tables.
DROP TABLE IF EXISTS public.company_statuses;
DROP TABLE IF EXISTS public.plans;

COMMIT;
