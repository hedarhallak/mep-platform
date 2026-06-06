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

-- 1. roles lookup row (role_id has no default → compute next; role_key not
--    uniquely-constrained → guard with NOT EXISTS).
INSERT INTO public.roles (role_id, role_key, label)
SELECT COALESCE(MAX(role_id), 0) + 1, 'OWNER', 'Owner'
  FROM public.roles
 WHERE NOT EXISTS (SELECT 1 FROM public.roles WHERE role_key = 'OWNER');

-- 2. OWNER permissions = COMPANY_ADMIN's full set (superset). PK (role,
--    permission_code) makes ON CONFLICT a clean no-op on re-run; the SELECT is
--    FK-safe because every copied permission_code already exists in permissions.
INSERT INTO public.role_permissions (role, permission_code)
SELECT 'OWNER', permission_code
  FROM public.role_permissions
 WHERE role = 'COMPANY_ADMIN'
ON CONFLICT (role, permission_code) DO NOTHING;

COMMIT;
