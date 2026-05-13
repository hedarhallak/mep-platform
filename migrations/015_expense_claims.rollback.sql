-- ============================================================================
-- 015_expense_claims.rollback.sql
--
-- Drops the expense_claims table + indexes + RLS policy + permission rows
-- + role_permissions rows. Data loss is irreversible. Export claim rows
-- first if any have been submitted before reverting:
--
--   psql -d mepdb -At -F$'\t' -c "
--     SELECT id, company_id, project_id, submitted_by_user_id, vendor,
--            amount_cents, currency, status, created_at
--       FROM public.expense_claims
--   " > /root/expense_claims-backup-$(date +%Y%m%d).tsv
-- ============================================================================

BEGIN;

-- Drop the table (cascades to indexes + RLS policy).
DROP TABLE IF EXISTS public.expense_claims CASCADE;

-- Drop the role_permissions rows we seeded.
DELETE FROM public.role_permissions
 WHERE permission_code LIKE 'expense_claims.%';

-- Drop the permissions rows we seeded.
DELETE FROM public.permissions
 WHERE code LIKE 'expense_claims.%';

-- Sanity check.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'expense_claims'
  ) THEN
    RAISE EXCEPTION 'Migration 015 rollback abort: expense_claims table still present';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.permissions WHERE code LIKE 'expense_claims.%'
  ) THEN
    RAISE EXCEPTION 'Migration 015 rollback abort: expense_claims permissions still present';
  END IF;
END $$;

COMMIT;
