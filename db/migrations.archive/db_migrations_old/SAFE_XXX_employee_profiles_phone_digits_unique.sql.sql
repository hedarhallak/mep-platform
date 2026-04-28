-- Migration: Add normalized phone_digits and enforce uniqueness (ERP-grade)
-- Target: public.employee_profiles
-- Approach: generated stored column + partial unique index (ignores empty digits)
-- Safe precondition: no duplicates in existing data (already verified)

BEGIN;

-- 1) Add generated column for normalized digits
ALTER TABLE public.employee_profiles
ADD COLUMN IF NOT EXISTS phone_digits TEXT
GENERATED ALWAYS AS (regexp_replace(phone, '\D', '', 'g')) STORED;

-- 2) Enforce uniqueness on digits (allow multiple empty strings if any exist)
CREATE UNIQUE INDEX IF NOT EXISTS employee_profiles_phone_digits_uniq
ON public.employee_profiles (phone_digits)
WHERE phone_digits <> '';

COMMIT;
