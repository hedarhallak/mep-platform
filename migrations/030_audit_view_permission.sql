-- migrations/030_audit_view_permission.sql  (§132 OWNER role — DECISIONS §140, Slice 2a)
--
-- Introduces the `audit.view` permission for the OWNER-only sensitive-edit audit
-- viewer (the §135/§136 old→new diffs — the fraud-detection picture). Granted to
-- OWNER only. SUPER_ADMIN bypasses permission checks anyway.
--
-- COMPANY_ADMIN does NOT get audit.view (separation of duties, §132.4 — the
-- permission distributor must not be the audit viewer). Re-gating the EXISTING
-- /permissions/audit (role_permissions changes) off COMPANY_ADMIN + the frontend
-- OWNER page are Slice 2b — NOT here. This migration is purely additive.
--
-- GRANTs: none (permissions + role_permissions are GLOBAL tables).
-- Idempotent: ON CONFLICT DO NOTHING.

BEGIN;

-- 1. Catalog the permission. permissions(code, description, grp).
INSERT INTO public.permissions (code, description, grp)
VALUES ('audit.view', 'View the sensitive-edit audit (OWNER only)', 'settings')
ON CONFLICT (code) DO NOTHING;

-- 2. Grant it to OWNER only.
INSERT INTO public.role_permissions (role, permission_code)
VALUES ('OWNER', 'audit.view')
ON CONFLICT (role, permission_code) DO NOTHING;

COMMIT;
