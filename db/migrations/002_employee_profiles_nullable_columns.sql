-- Migration: 002_employee_profiles_nullable_columns.sql
-- Date: 2026-03-12
-- Description: Make optional columns in employee_profiles nullable.
--              These fields are completed by the employee after onboarding,
--              not required at invite time.

ALTER TABLE public.employee_profiles
  ALTER COLUMN phone         DROP NOT NULL,
  ALTER COLUMN trade_code    DROP NOT NULL,
  ALTER COLUMN role_code     DROP NOT NULL,
  ALTER COLUMN rank_code     DROP NOT NULL,
  ALTER COLUMN home_location DROP NOT NULL;

-- Rollback (if needed):
-- ALTER TABLE public.employee_profiles
--   ALTER COLUMN phone         SET NOT NULL,
--   ALTER COLUMN trade_code    SET NOT NULL,
--   ALTER COLUMN role_code     SET NOT NULL,
--   ALTER COLUMN rank_code     SET NOT NULL,
--   ALTER COLUMN home_location SET NOT NULL;
