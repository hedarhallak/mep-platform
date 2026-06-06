-- migrations/029_owner_role.sql  (§132 OWNER role — DECISIONS §140, Slice 1)
--
-- Introduces the OWNER role: the tenant's root of trust, Constrai-provisioned,
-- above the technical COMPANY_ADMIN (separation of duties, §132.4/§132.5).
-- DECISION (Hedar §140.1): OWNER = SUPERSET of COMPANY_ADMIN + (later) exclusive
-- audit. This migration does the superset half:
--   1. Register OWNER in the `roles` lookup table.
--   2. Seed `role_permissions` for OWNER as a COPY of COMPANY_ADMIN's current set.
--
-- The EXCLUSIVE-audit half (switching the audit gate to an OWNER-only permission
-- and REMOVING it from COMPANY_ADMIN) is Slice 2 — not here.
--
-- NOTE: this is a SNAPSHOT of COMPANY_ADMIN's permissions at migration time. If
-- COMPANY_ADMIN's set changes later, re-sync OWNER (a one-liner re-run of the
-- second INSERT). The role-level guard (middleware/roles.js canAssignRole) is
-- what actually protects OWNER from in-tenant assignment — see the route guards.
--
-- GRANTs: none (roles + role_permissions are GLOBAL tables, not company-scoped).
-- Idempotent: WHERE NOT EXISTS + ON CONFLICT DO NOTHING.
-- Deploy: backend restart clears the 5-min permissions cache (middleware/permissions.js).

BEGIN;

-- 0. Allow 'OWNER' in the app_users.role CHECK constraint. Without this, NO
--    user can be assigned role='OWNER' at the DB level (the constraint enumerates
--    the valid roles and OWNER was not in it) — provisioning (Slice 3) would fail.
--    DROP + re-ADD is idempotent; the list mirrors the baseline + OWNER.
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (
  role = ANY (ARRAY[
    'SUPER_ADMIN', 'OWNER', 'IT_ADMIN', 'COMPANY_ADMIN', 'TRADE_PROJECT_MANAGER',
    'TRADE_ADMIN', 'FOREMAN', 'JOURNEYMAN', 'APPRENTICE_1', 'APPRENTICE_2',
    'APPRENTICE_3', 'APPRENTICE_4', 'WORKER', 'DRIVER'
  ]::text[])
);

-- 1. roles lookup row. role_id has a SEQUENCE default — do NOT set it explicitly
--    (Pitfall #61): an explicit MAX+1 leaves the sequence behind, and the next
--    sequence-based insert (tests/helpers/db.js ensureSeedData, or any app
--    insert) then collides on roles_pkey. Let the sequence assign role_id,
--    exactly like every other roles insert. role_key is UNIQUE → ON CONFLICT
--    makes this idempotent.
INSERT INTO public.roles (role_key, label)
VALUES ('OWNER', 'Owner')
ON CONFLICT (role_key) DO NOTHING;

-- 2. OWNER permissions = COMPANY_ADMIN's full set (superset). PK (role,
--    permission_code) makes ON CONFLICT a clean no-op on re-run; the SELECT is
--    FK-safe because every copied permission_code already exists in permissions.
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'OWNER', permission_code
  FROM public.role_permissions
 WHERE role = 'COMPANY_ADMIN'
ON CONFLICT (role, permission_code) DO NOTHING;

COMMIT;
