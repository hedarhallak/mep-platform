-- 010_employees_email_and_invites.sql
-- Adds email fields needed for invite/activation flow.

BEGIN;

-- Employees: store login email (future: primary identity)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS email text;

-- Employee invites: store the invited email (so activation can be email-based)
ALTER TABLE public.employee_invites
  ADD COLUMN IF NOT EXISTS email text;

-- Unique per company (case-insensitive). Allow multiple NULLs.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'employees_company_email_uniq'
  ) THEN
    CREATE UNIQUE INDEX employees_company_email_uniq
      ON public.employees (company_id, lower(email))
      WHERE email IS NOT NULL;
  END IF;
END $$;

-- Optional best-effort backfill from app_users.username when it looks like an email.
-- Safe: only fills employees.email when NULL.
UPDATE public.employees e
SET email = u.username
FROM public.app_users u
WHERE u.employee_id = e.id
  AND e.email IS NULL
  AND u.username LIKE '%@%';

COMMIT;
