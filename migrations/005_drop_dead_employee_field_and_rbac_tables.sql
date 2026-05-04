-- Section 67/71 → C3 batch 3 — Drop 10 dead tables across two unrelated families:
--   - employee_field_* (5 tables, internally coupled via FK)
--   - legacy RBAC (5 tables, fully isolated)
--
-- Identified in Section 66 Audit 4. The two families are dropped in the same
-- migration because they're independently safe and combining them halves the
-- PR overhead.
--
-- Family A — employee_field_* dynamic-employee-field subsystem (never built):
--   Parent:   public.employee_field_catalog
--   Children: public.company_employee_field_config       → catalog.field_key
--             public.employee_field_values                → catalog.field_key
--             public.employee_sensitive_values            → catalog.field_key
--             public.sensitive_access_log                 → catalog.field_key
--
--   sensitive_access_log was originally slotted for batch 5 ("features designed
--   but never built") but it shares the field_key FK with the rest of the
--   family, so dropping the parent without it would leave an orphan FK.
--   Cleanest to take the whole family in one transaction.
--
-- Family B — legacy RBAC tables (replaced by app_users.role single column):
--   public.assignment_roles
--   public.employee_ranks
--   public.employee_roles
--   public.employee_trades
--   public.user_trade_access
--
--   All 5 have zero FKs (in or out) and zero code references — fully isolated.
--
-- Verification per table (Section 66 + final-pass grep):
--   - Zero references in routes/ lib/ services/ jobs/ middleware/ scripts/
--     tests/ seed.js + mep-frontend/src + mep-mobile/src.
--   - For Family A: only FK references are within the family itself.
--   - For Family B: zero FK references in any direction.
--
-- Drop order: Family A children first (because they reference the parent),
-- then Family A parent, then Family B (any order). Single BEGIN/COMMIT so a
-- failure rolls everything back atomically.

BEGIN;

-- Family A — children first (to satisfy FK constraints without CASCADE)
DROP TABLE IF EXISTS public.sensitive_access_log;
DROP TABLE IF EXISTS public.employee_sensitive_values;
DROP TABLE IF EXISTS public.employee_field_values;
DROP TABLE IF EXISTS public.company_employee_field_config;
DROP TABLE IF EXISTS public.employee_field_catalog;

-- Family B — fully independent
DROP TABLE IF EXISTS public.assignment_roles;
DROP TABLE IF EXISTS public.employee_ranks;
DROP TABLE IF EXISTS public.employee_roles;
DROP TABLE IF EXISTS public.employee_trades;
DROP TABLE IF EXISTS public.user_trade_access;

COMMIT;
