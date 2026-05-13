-- ============================================================================
-- 015_expense_claims.sql
--
-- Section 94.5 — Emergency purchase / invoice submission workflow.
--
-- A new tenant-scoped table for tracking expense claims: workers
-- (foremen, journeymen, etc.) buy something on-site in an emergency
-- (Home Depot run for a $40 part to keep the site moving), photograph
-- the receipt, and submit it via the mobile app. Tenant admin reviews +
-- approves; the company then reimburses externally (Constrai does NOT
-- process the actual payment — we just track the claim).
--
-- Schema notes:
--   * `amount_cents` (bigint) — integer cents to avoid float precision
--     issues. $40.50 stored as 4050. Backend renders to dollars on
--     the way out.
--   * `currency` (varchar(3)) — ISO-4217 code. Defaults to 'CAD'
--     (Quebec is the primary market today). The column exists for
--     future cross-border tenants but the backend only validates
--     against CAD/USD for now.
--   * `status` CHECK constraint enumerates the 4 valid states. This
--     does NOT prevent future status additions — a follow-up migration
--     can drop and re-add the constraint with new values.
--   * `receipt_url` (text, nullable) — public URL of the photo
--     (typically DigitalOcean Spaces). Storage pipeline lives in the
--     application layer; this column just holds the URL.
--   * `employee_id` is the WORKER who paid out of pocket; nullable
--     because some tenants might submit pre-emptive claims (e.g.,
--     reimbursement request before the run). `submitted_by_user_id`
--     is the app user account that hit POST — usually the same person,
--     but not always (foreman might submit on behalf of an apprentice
--     who doesn't have mobile access yet).
--
-- RLS:
--   Strict tenant_isolation from day one (matches the post-013 RLS
--   posture — we don't repeat Phase 4's permissive→strict ramp for
--   new tables). Mounted via tenantDb.
--
-- Indexes:
--   * (company_id, status) — every list query filters by tenant first,
--     then by approval queue or "my pending" view.
--   * (project_id) — joins from project drill-down pages.
--   * (submitted_by_user_id) — "show me MY claims" view.
--
-- Permissions seeded:
--   * expense_claims.submit  — granted to WORKER, JOURNEYMAN, FOREMAN,
--     APPRENTICE_*, DRIVER (anyone who might pay out of pocket).
--   * expense_claims.view    — granted to FOREMAN, COMPANY_ADMIN,
--     TRADE_PROJECT_MANAGER, TRADE_ADMIN, IT_ADMIN.
--   * expense_claims.approve — granted to FOREMAN (for own-project
--     claims), COMPANY_ADMIN, TRADE_ADMIN.
--
-- Rollback: 015_expense_claims.rollback.sql drops the table + indexes
-- + RLS policy. Permission rows can be left in place (harmless once
-- the table is gone); the rollback drops them too for tidiness.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Table
-- ----------------------------------------------------------------------------

CREATE TABLE public.expense_claims (
  id                     bigserial PRIMARY KEY,
  company_id             bigint    NOT NULL REFERENCES public.companies(company_id),
  project_id             bigint    NOT NULL REFERENCES public.projects(id),
  employee_id            bigint             REFERENCES public.employees(id),
  submitted_by_user_id   bigint    NOT NULL REFERENCES public.app_users(id),
  vendor                 text      NOT NULL,
  amount_cents           bigint    NOT NULL,
  currency               varchar(3) NOT NULL DEFAULT 'CAD',
  receipt_url            text,
  description            text,
  status                 varchar(32) NOT NULL DEFAULT 'PENDING'
                                    CHECK (status IN ('PENDING','APPROVED','REJECTED','PAID')),
  approved_by_user_id    bigint             REFERENCES public.app_users(id),
  approved_at            timestamptz,
  rejection_reason       text,
  created_at             timestamptz NOT NULL DEFAULT NOW(),
  updated_at             timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.expense_claims IS
  'Section 94.5 — emergency purchase claims submitted by workers for tenant-admin approval. Constrai tracks the claim only; reimbursement happens externally to the platform.';

COMMENT ON COLUMN public.expense_claims.amount_cents IS
  'Amount in cents (integer) to avoid float precision issues. $40.50 = 4050.';

COMMENT ON COLUMN public.expense_claims.currency IS
  'ISO-4217 code. Default CAD. Backend currently validates only CAD/USD.';

COMMENT ON COLUMN public.expense_claims.status IS
  'PENDING (submitted) | APPROVED (admin OK''d, awaiting external payment) | REJECTED (admin denied) | PAID (admin marked as reimbursed).';

-- ----------------------------------------------------------------------------
-- 2. Indexes
-- ----------------------------------------------------------------------------

CREATE INDEX expense_claims_company_status_idx
  ON public.expense_claims (company_id, status);

CREATE INDEX expense_claims_project_idx
  ON public.expense_claims (project_id);

CREATE INDEX expense_claims_submitted_by_idx
  ON public.expense_claims (submitted_by_user_id);

-- ----------------------------------------------------------------------------
-- 3. RLS — strict tenant_isolation (no permissive ramp; matches post-013 posture)
-- ----------------------------------------------------------------------------

ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_claims FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.expense_claims
  USING (
    company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
  )
  WITH CHECK (
    company_id = NULLIF(current_setting('app.company_id', true), '')::bigint
  );

-- mepuser_super (BYPASSRLS) sees all tenants — used by SUPER_ADMIN
-- cross-tenant queries. mepuser (regular pool) is filtered by the policy.

-- ----------------------------------------------------------------------------
-- 4. Permissions
-- ----------------------------------------------------------------------------

INSERT INTO public.permissions (code, description, grp) VALUES
  ('expense_claims.submit',  'Submit an expense claim',                    'expense_claims'),
  ('expense_claims.view',    'View expense claims (own + project-scoped)', 'expense_claims'),
  ('expense_claims.approve', 'Approve or reject expense claims',           'expense_claims')
ON CONFLICT (code) DO NOTHING;

-- Submit: anyone who might pay out of pocket on a site.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('WORKER',                'expense_claims.submit'),
  ('JOURNEYMAN',            'expense_claims.submit'),
  ('FOREMAN',               'expense_claims.submit'),
  ('APPRENTICE_1',          'expense_claims.submit'),
  ('APPRENTICE_2',          'expense_claims.submit'),
  ('APPRENTICE_3',          'expense_claims.submit'),
  ('APPRENTICE_4',          'expense_claims.submit'),
  ('DRIVER',                'expense_claims.submit'),
  ('TRADE_PROJECT_MANAGER', 'expense_claims.submit'),
  ('TRADE_ADMIN',           'expense_claims.submit'),
  ('COMPANY_ADMIN',         'expense_claims.submit'),
  ('IT_ADMIN',              'expense_claims.submit')
ON CONFLICT (role, permission_code) DO NOTHING;

-- View: managers + admins.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('FOREMAN',               'expense_claims.view'),
  ('TRADE_PROJECT_MANAGER', 'expense_claims.view'),
  ('TRADE_ADMIN',           'expense_claims.view'),
  ('COMPANY_ADMIN',         'expense_claims.view'),
  ('IT_ADMIN',              'expense_claims.view')
ON CONFLICT (role, permission_code) DO NOTHING;

-- Approve: foremen (own project), trade admin, company admin.
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('FOREMAN',               'expense_claims.approve'),
  ('TRADE_ADMIN',           'expense_claims.approve'),
  ('COMPANY_ADMIN',         'expense_claims.approve')
ON CONFLICT (role, permission_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Sanity check
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  expected_perms int := 3;
  actual_perms int;
BEGIN
  SELECT COUNT(*) INTO actual_perms
    FROM public.permissions
   WHERE code LIKE 'expense_claims.%';

  IF actual_perms <> expected_perms THEN
    RAISE EXCEPTION
      'Migration 015 abort: expected % expense_claims.* permissions, found %',
      expected_perms, actual_perms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'expense_claims'
       AND p.polname = 'tenant_isolation'
  ) THEN
    RAISE EXCEPTION 'Migration 015 abort: tenant_isolation policy not present on expense_claims';
  END IF;
END $$;

COMMIT;
