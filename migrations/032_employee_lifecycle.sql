-- Migration 032: Employee Lifecycle Fields
-- Adds hire_date, termination_date to employees table
-- Adds profile_completed flag to app_users

-- ── hire_date & termination_date ──
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS hire_date DATE,
  ADD COLUMN IF NOT EXISTS termination_date DATE;

-- Backfill hire_date from created_at for existing employees
UPDATE public.employees
  SET hire_date = created_at::date
  WHERE hire_date IS NULL AND is_active = true;

-- ── profile_completed flag ──
-- Replaces the unused profile_status column with a clear boolean
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT false;

-- Backfill: mark users with a completed profile as profile_completed
UPDATE public.app_users au
  SET profile_completed = true
  FROM public.employee_profiles ep
  WHERE ep.employee_id = au.employee_id
    AND ep.phone IS NOT NULL
    AND ep.home_address IS NOT NULL;

-- ── Index for common queries ──
CREATE INDEX IF NOT EXISTS idx_employees_company_active
  ON public.employees (company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_employees_hire_date
  ON public.employees (hire_date);
