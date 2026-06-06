-- scripts/postgres/backfill_schema_migrations.sql  (DECISIONS §139)
--
-- ONE-TIME backfill. Prod migrations 000–028 were applied MANUALLY (psql),
-- which never recorded them into `schema_migrations` (scripts/migrate.js's
-- bookkeeping table). Without this, `npm run migrate` would think every old
-- migration is "pending" and try to re-run them (000_baseline is NOT
-- idempotent → it would fail). This records them as already-applied so that,
-- going forward, `npm run migrate` applies ONLY new (029+) migrations.
--
-- Lives OUTSIDE migrations/ on purpose, so the runner never picks it up.
-- Lists FORWARD migrations only (migrate.js skips *.rollback.sql).
-- Idempotent: ON CONFLICT DO NOTHING — safe to re-run.
--
-- Run ONCE on prod:
--   sudo -u postgres psql mepdb -f /var/www/mep/scripts/postgres/backfill_schema_migrations.sql
-- Verify afterwards:
--   sudo -u postgres psql mepdb -c "SELECT count(*) FROM schema_migrations;"   -- expect 29
--   cd /var/www/mep && node scripts/migrate.js                                  -- expect "No pending migrations."

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id          SERIAL PRIMARY KEY,
  filename    TEXT NOT NULL UNIQUE,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.schema_migrations (filename) VALUES
  ('000_baseline_2026-04-28.sql'),
  ('001_user_invites.sql'),
  ('002_project_foremen_cleanup.sql'),
  ('003_drop_dead_materials_tables.sql'),
  ('004_drop_dead_travel_allowance_tables.sql'),
  ('005_drop_dead_employee_field_and_rbac_tables.sql'),
  ('006_drop_dead_erp_schema.sql'),
  ('007_drop_dead_feature_never_built_tables.sql'),
  ('008_drop_dead_ccq_travel_allowance_tables.sql'),
  ('009_drop_dead_columns_batch_1.sql'),
  ('010_drop_company_statuses_and_plans.sql'),
  ('011_email_globally_unique.sql'),
  ('012_rls_stage1_permissive.sql'),
  ('013_rls_strict.sql'),
  ('014_company_branding.sql'),
  ('015_expense_claims.sql'),
  ('016_drop_legacy_logo_url.sql'),
  ('017_companies_max_users.sql'),
  ('018_billing_schema.sql'),
  ('019_backfill_subscriptions.sql'),
  ('020_billing_schema_grants.sql'),
  ('021_fix_gst_rate_scale.sql'),
  ('022_totp_2fa_super_admin.sql'),
  ('023_trial_warned_at.sql'),
  ('024_tool_tracking.sql'),
  ('025_expense_claims_grants.sql'),
  ('026_expense_approve_company_admin_only.sql'),
  ('027_assignment_location_snapshot.sql'),
  ('028_session_activity_caps.sql')
ON CONFLICT (filename) DO NOTHING;
