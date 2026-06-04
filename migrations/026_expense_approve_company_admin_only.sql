-- ============================================================================
-- 026_expense_approve_company_admin_only.sql
--
-- Section 129.8 — Hedar's approval-model decision (June 2026):
-- emergency-purchase approval belongs to the company's PURCHASING
-- function, not the field chain. No multi-level approval.
--
--   * Submit  — field roles (unchanged, from migration 015).
--   * Approve — COMPANY_ADMIN only by default. Companies grant
--     `expense_claims.approve` to their purchasing staff individually
--     via the Permissions page (user_permissions overrides — unchanged
--     mechanism, takes precedence over role defaults).
--   * FOREMAN could previously approve his OWN claim (015 default) —
--     that's the specific thing this migration removes. TRADE_ADMIN
--     also dropped per the same decision.
--
-- NOTE: middleware/permissions.js caches role permissions — restart
-- pm2 after applying on prod.
-- ============================================================================

BEGIN;

DELETE FROM public.role_permissions
 WHERE permission_code = 'expense_claims.approve'
   AND role IN ('FOREMAN', 'TRADE_ADMIN');

-- Sanity: COMPANY_ADMIN must keep approve.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.role_permissions
     WHERE role = 'COMPANY_ADMIN'
       AND permission_code = 'expense_claims.approve'
  ) THEN
    RAISE EXCEPTION 'Migration 026 abort: COMPANY_ADMIN lost expense_claims.approve';
  END IF;
END $$;

COMMIT;
