-- 040_unique_email_empcode_per_company.sql
-- §158: identity-field uniqueness, scoped to the tenant (pilot-readiness).
--
-- 1+2. Email is the login/invite identity — enforce per-company uniqueness at
--      the DB level (was only a code-level check in the invite route, so side
--      paths could create duplicates). Case-insensitive via lower(). Partial:
--      NULL emails and platform accounts (company_id IS NULL) stay exempt.
--      Cross-company duplicates remain ALLOWED by design (the same person may
--      exist in two companies).
--
-- 3.   employee_code was globally UNIQUE across all tenants — a multi-tenant
--      bug: company B could not reuse a code company A holds (and code
--      collisions leak existence across tenants). Rescope to per-company.
--      The new index is non-partial so seed.js's
--      ON CONFLICT (company_id, employee_code) can target it.
--
-- Pre-checked on prod (Aug 2026): zero duplicate emails per company, zero
-- duplicate codes per company, zero NULL company_ids — safe to apply.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS app_users_company_email_uniq
  ON public.app_users (company_id, lower(email))
  WHERE email IS NOT NULL AND company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_email_uniq
  ON public.employees (company_id, lower(email))
  WHERE email IS NOT NULL AND company_id IS NOT NULL;

ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_employee_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS employees_company_code_uniq
  ON public.employees (company_id, employee_code);

COMMIT;
