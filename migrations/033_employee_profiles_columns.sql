-- Migration 033: Add missing columns to employee_profiles
-- These columns are needed by profile.js, onboarding, and employee edit modal.

-- ── Contact & trade info ──
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS phone            VARCHAR(30),
  ADD COLUMN IF NOT EXISTS role_code        VARCHAR(40),
  ADD COLUMN IF NOT EXISTS rank_code        VARCHAR(40);

-- ── Address breakdown ──
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS home_unit        VARCHAR(30),
  ADD COLUMN IF NOT EXISTS city             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS postal_code      VARCHAR(15),
  ADD COLUMN IF NOT EXISTS province         VARCHAR(60)  DEFAULT 'QC',
  ADD COLUMN IF NOT EXISTS country          VARCHAR(60)  DEFAULT 'CA';

-- ── Emergency contact extras ──
ALTER TABLE public.employee_profiles
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(60);

-- ── Sync employee_profile_type from app_users where missing ──
UPDATE public.employees e
  SET employee_profile_type = au.role
  FROM public.app_users au
  WHERE au.employee_id = e.id
    AND (e.employee_profile_type IS NULL OR e.employee_profile_type = '');

-- ── Backfill role_code in profiles from app_users ──
UPDATE public.employee_profiles ep
  SET role_code = au.role
  FROM public.app_users au
  WHERE au.employee_id = ep.employee_id
    AND (ep.role_code IS NULL OR ep.role_code = '');
