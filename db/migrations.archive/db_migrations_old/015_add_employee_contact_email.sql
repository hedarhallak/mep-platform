-- db/migrations/015_add_employee_contact_email.sql
-- D3.1: Add employees.contact_email (communication email) for Daily Dispatch / notifications
-- Safe / additive: no deletes, no refactors. Does not change login behavior.

BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Optional index for lookups / uniqueness enforcement later (not unique by design here)
CREATE INDEX IF NOT EXISTS idx_employees_contact_email
  ON public.employees (contact_email);

-- Safe backfill: if contact_email is NULL, copy from existing email (if any)
UPDATE public.employees
  SET contact_email = email
  WHERE contact_email IS NULL
    AND email IS NOT NULL
    AND NULLIF(TRIM(email), '') IS NOT NULL;

COMMIT;
