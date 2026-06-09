-- migrations/031_audit_view_owner_exclusive.sql  (§132 / DECISIONS §140, Slice 2b)
--
-- Make `audit.view` OWNER-exclusive. It was found already granted to
-- COMPANY_ADMIN and IT_ADMIN (from the DEFAULT_ROLE_PERMISSIONS seed), which let
-- those technical admins reach the OWNER sensitive-edit audit viewer
-- (/api/permissions/owner-audit) — violating the §132.4 separation of duties
-- (the permission distributor must not be the audit reader). Revoke it from
-- both; OWNER keeps it (SUPER_ADMIN bypasses permission checks anyway).
--
-- Safe: NOTHING gates on `audit.view` except the new owner-audit endpoint, so
-- this only removes those roles' access to that endpoint — no other behavior
-- changes. The matching DEFAULT_ROLE_PERMISSIONS arrays in routes/permissions.js
-- were updated in the same PR so a future "reset to defaults" won't re-grant it.
--
-- GRANTs: none. Idempotent: DELETE is naturally a no-op on re-run.
-- Deploy: backend restart clears the permissions cache.

BEGIN;

DELETE FROM public.role_permissions
 WHERE permission_code = 'audit.view'
   AND role IN ('COMPANY_ADMIN', 'IT_ADMIN');

COMMIT;
