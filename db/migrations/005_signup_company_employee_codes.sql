-- db/migrations/005_signup_company_employee_codes.sql
-- Controlled Sign Up (Policy A):
-- Users can sign up using Company Code + Employee Code.
--
-- This migration adds:
--  - companies.company_code (unique)
--  - employees.company_id + employees.employee_code + unique (company_id, employee_code)
--  - app_users.company_id + app_users.employee_id + unique employee_id
--
-- Safe: uses ADD COLUMN IF NOT EXISTS and conditional checks.

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

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='companies'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_employees_company_id'
      ) THEN
        ALTER TABLE public.employees
          ADD CONSTRAINT fk_employees_company_id
          FOREIGN KEY (company_id) REFERENCES public.companies(id);
      END IF;
    END IF;

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

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='companies'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_app_users_company_id'
      ) THEN
        ALTER TABLE public.app_users
          ADD CONSTRAINT fk_app_users_company_id
          FOREIGN KEY (company_id) REFERENCES public.companies(id);
      END IF;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='employees'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_app_users_employee_id'
      ) THEN
        ALTER TABLE public.app_users
          ADD CONSTRAINT fk_app_users_employee_id
          FOREIGN KEY (employee_id) REFERENCES public.employees(id);
      END IF;
    END IF;

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
