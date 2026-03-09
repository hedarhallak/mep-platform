-- 008_employees_add_fullname_phone.sql
-- Purpose: allow Admin to store basic directory fields at creation time.
-- Safe: uses IF NOT EXISTS guards and does not change existing constraints.

BEGIN;

ALTER TABLE IF EXISTS public.employees
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text;

-- Helper index for case-insensitive employee_code lookups scoped by company.
-- (Not a uniqueness constraint; we enforce uniqueness in the API for now.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='employees' AND column_name='company_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employees_company_upper_code ON public.employees (company_id, upper(employee_code))';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employees_upper_code ON public.employees (upper(employee_code))';
  END IF;
END $$;

COMMIT;
