-- 012_employee_profiles_home_unit.sql
-- D2 UI enhancement support: store Apt/Unit separately (safe additive change)

BEGIN;

ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS home_unit TEXT;

COMMIT;
