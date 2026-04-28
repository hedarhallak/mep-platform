-- db/migrations/014_daily_dispatch_core.sql
-- E1: Daily Dispatch Core (DB only)
-- Adds company-level dispatch settings + dispatch run tracking + per-employee daily dispatch state.
-- Safe / additive: no deletes, no refactors, no behavior changes until routes/UI use these tables.

BEGIN;

-- 1) Company-level settings
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='companies'
  ) THEN
    ALTER TABLE public.companies
      ADD COLUMN IF NOT EXISTS dispatch_time TIME,
      ADD COLUMN IF NOT EXISTS dispatch_timezone TEXT;

    -- Defaults (safe): keep NULL if you prefer manual configuration later
    -- But set a sane default timezone if missing.
    UPDATE public.companies
      SET dispatch_timezone = COALESCE(dispatch_timezone, 'America/Montreal')
      WHERE dispatch_timezone IS NULL;

  END IF;
END $$;

-- 2) Daily dispatch runs (one per company per date)
CREATE TABLE IF NOT EXISTS public.daily_dispatch_runs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT,
  dispatch_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'STARTED', -- STARTED | SENT | FAILED
  triggered_by_user_id BIGINT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Unique per company/day (company_id NULL allowed; uniqueness won't apply)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_daily_dispatch_runs_company_date'
  ) THEN
    ALTER TABLE public.daily_dispatch_runs
      ADD CONSTRAINT uq_daily_dispatch_runs_company_date UNIQUE (company_id, dispatch_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_daily_dispatch_runs_company_date
  ON public.daily_dispatch_runs (company_id, dispatch_date);

CREATE INDEX IF NOT EXISTS idx_daily_dispatch_runs_status
  ON public.daily_dispatch_runs (status);

-- Optional FKs (NOT VALID = safe for existing data; validate later when ready)
DO $$
BEGIN
  -- FK to companies intentionally omitted (company PK name may vary across baselines)

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='app_users') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_daily_dispatch_runs_triggered_by_user') THEN
      ALTER TABLE public.daily_dispatch_runs
        ADD CONSTRAINT fk_daily_dispatch_runs_triggered_by_user
        FOREIGN KEY (triggered_by_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL NOT VALID;
    END IF;
  END IF;
END $$;

-- 3) Per-employee daily dispatch state (tracks last digest that was sent)
CREATE TABLE IF NOT EXISTS public.employee_daily_dispatch_state (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT,
  employee_id BIGINT NOT NULL,
  work_date DATE NOT NULL,
  last_sent_version INT NOT NULL DEFAULT 0,
  last_sent_payload_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_sent_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_employee_daily_dispatch_state_emp_date'
  ) THEN
    ALTER TABLE public.employee_daily_dispatch_state
      ADD CONSTRAINT uq_employee_daily_dispatch_state_emp_date UNIQUE (employee_id, work_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_employee_daily_dispatch_state_company_date
  ON public.employee_daily_dispatch_state (company_id, work_date);

CREATE INDEX IF NOT EXISTS idx_employee_daily_dispatch_state_employee_date
  ON public.employee_daily_dispatch_state (employee_id, work_date);

-- Optional FKs (NOT VALID)
DO $$
BEGIN
  -- FK to companies intentionally omitted (company PK name may vary across baselines)

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='employees') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_employee_daily_dispatch_state_employee') THEN
      ALTER TABLE public.employee_daily_dispatch_state
        ADD CONSTRAINT fk_employee_daily_dispatch_state_employee
        FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;
END $$;

COMMIT;
