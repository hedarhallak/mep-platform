-- db/migrations/009_employee_profiles_more_fields.sql
-- Step 1: Extend employee_profiles for Profile tab (SAFE)
-- Adds optional address + emergency contact fields, and adds APPRENTICE_4 rank.
-- Safe: IF NOT EXISTS, idempotent, no breaking NOT NULL changes.

BEGIN;

-- Extend profile fields (nullable for backward compatibility)
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;

-- Add apprentice level 4
INSERT INTO public.employee_ranks(code,label) VALUES
  ('APPRENTICE_4','Apprentice Level 4')
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label;

COMMIT;
