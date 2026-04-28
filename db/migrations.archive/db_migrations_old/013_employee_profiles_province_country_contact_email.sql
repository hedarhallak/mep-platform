-- 013_employee_profiles_province_country_contact_email.sql
-- D2 enhancement: persist province/country (and optional contact_email) in employee_profiles
-- Safe additive change

BEGIN;

ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS province TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Defaults for new rows (existing rows remain NULL until updated)
ALTER TABLE public.employee_profiles
  ALTER COLUMN province SET DEFAULT 'QC',
  ALTER COLUMN country SET DEFAULT 'Canada';

COMMIT;
