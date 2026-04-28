-- db/migrations/005c_signup_codes_ultra_safe.sql
-- Controlled Sign Up (Policy A) - ULTRA SAFE VERSION
-- Goal: add needed columns WITHOUT assuming PK names and WITHOUT creating UNIQUE indexes that may fail on existing data.
-- We will:
--  - add companies.company_code (unique constraint is skipped to avoid schema incompatibility; we'll enforce later after cleanup)
--  - add employees.company_id + employees.employee_code (unique enforcement deferred)
--  - add app_users.company_id + app_users.employee_id (unique enforcement deferred)
--  - create NON-UNIQUE indexes only (safe)

BEGIN;

-- companies: company_code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='companies'
  ) THEN
    ALTER TABLE public.companies
      ADD COLUMN IF NOT EXISTS company_code TEXT;
    -- NOTE: uniqueness enforced later once codes are populated and verified
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_companies_company_code'
    ) THEN
      CREATE INDEX idx_companies_company_code
        ON public.companies(company_code)
        WHERE company_code IS NOT NULL;
    END IF;
  END IF;
END$$;

-- employees: company_id + employee_code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='employees'
  ) THEN
    ALTER TABLE public.employees
      ADD COLUMN IF NOT EXISTS company_id BIGINT,
      ADD COLUMN IF NOT EXISTS employee_code TEXT;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_employees_company_id'
    ) THEN
      CREATE INDEX idx_employees_company_id ON public.employees(company_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_employees_employee_code'
    ) THEN
      CREATE INDEX idx_employees_employee_code
        ON public.employees(employee_code)
        WHERE employee_code IS NOT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_employees_company_employee_code'
    ) THEN
      CREATE INDEX idx_employees_company_employee_code
        ON public.employees(company_id, employee_code)
        WHERE employee_code IS NOT NULL AND company_id IS NOT NULL;
    END IF;
  END IF;
END$$;

-- app_users: company_id + employee_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='app_users'
  ) THEN
    ALTER TABLE public.app_users
      ADD COLUMN IF NOT EXISTS company_id BIGINT,
      ADD COLUMN IF NOT EXISTS employee_id BIGINT;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_app_users_employee_id'
    ) THEN
      CREATE INDEX idx_app_users_employee_id
        ON public.app_users(employee_id)
        WHERE employee_id IS NOT NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_app_users_company_id'
    ) THEN
      CREATE INDEX idx_app_users_company_id
        ON public.app_users(company_id)
        WHERE company_id IS NOT NULL;
    END IF;
  END IF;
END$$;

COMMIT;
