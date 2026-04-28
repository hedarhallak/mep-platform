-- db/migrations/005b_signup_company_employee_codes_NO_FK.sql
-- Controlled Sign Up (Policy A) - SAFE VERSION
-- Fixes previous failure by NOT assuming companies primary key column name is "id".
-- We add columns + unique indexes only (no foreign keys). This avoids breaking on existing schemas.
--
-- Adds:
--  - companies.company_code (unique)
--  - employees.company_id + employees.employee_code + unique (company_id, employee_code)
--  - app_users.company_id + app_users.employee_id + unique employee_id (one user per employee)

BEGIN;

-- 1) companies.company_code
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='companies'
  ) THEN
    ALTER TABLE public.companies
      ADD COLUMN IF NOT EXISTS company_code TEXT;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'uq_companies_company_code'
    ) THEN
      ALTER TABLE public.companies
        ADD CONSTRAINT uq_companies_company_code UNIQUE (company_code);
    END IF;
  END IF;
END$$;

-- 2) employees.company_id + employees.employee_code
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
      WHERE schemaname='public' AND indexname='uq_employees_company_employee_code'
    ) THEN
      CREATE UNIQUE INDEX uq_employees_company_employee_code
        ON public.employees(company_id, employee_code)
        WHERE employee_code IS NOT NULL AND company_id IS NOT NULL;
    END IF;
  END IF;
END$$;

-- 3) app_users.company_id + app_users.employee_id
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
      WHERE schemaname='public' AND indexname='uq_app_users_employee_id'
    ) THEN
      CREATE UNIQUE INDEX uq_app_users_employee_id
        ON public.app_users(employee_id)
        WHERE employee_id IS NOT NULL;
    END IF;
  END IF;
END$$;

COMMIT;
