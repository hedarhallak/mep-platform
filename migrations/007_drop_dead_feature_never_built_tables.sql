-- Section 67/73 → C3 batch 5 — Drop 8 dead "feature-designed-but-never-built" tables.
--
-- Final batch of the C3 dead-table cleanup. These are 8 tables whose schema
-- was designed for features that never landed in code: borrow requests,
-- early checkout requests, parking claims, attendance absences (with their
-- audit log + reason lookup), and a stillborn `company_settings` (real
-- config lives directly on the companies table). Plus project_geofences,
-- a PostGIS-typed table whose corresponding queries (`ST_DWithin`,
-- `ST_Contains`, `geofence`) appear nowhere in active code.
--
-- ════════════════════════════════════════════════════════════
-- Excluded from this batch — `company_statuses` and `plans`:
-- ════════════════════════════════════════════════════════════
--
-- Section 66 audit flagged them as "rare" (1 reference each — only seen in
-- tests/helpers/db.js seeding). But the SCHEMA tells a different story:
--
--   companies.status  →  company_statuses(code)   (FK constraint, live)
--   companies.plan    →  plans(code)              (FK constraint, live)
--
-- Both tables are pure lookup tables enforcing ENUM-like constraints on
-- the active `companies` table. Application code never SELECTs from them
-- directly because the columns they constrain are queried straight on
-- companies.* — but the FK validation IS doing real work: every company
-- INSERT/UPDATE that touches status or plan is checked against these tables.
--
-- Dropping them safely would require either (a) converting the FKs to
-- inline `CHECK (status IN (...))` constraints first, or (b) accepting that
-- the columns become unconstrained free text. (a) is cleaner but a separate
-- migration decision; (b) is a schema-integrity downgrade. Either way, not
-- this batch.
--
-- ════════════════════════════════════════════════════════════
-- Tables dropped here (8):
-- ════════════════════════════════════════════════════════════
--
--   public.borrow_requests              (between-project employee borrowing — never built)
--   public.early_checkout_requests      (early-leave-from-shift workflow — never built)
--   public.parking_claims               (employee parking reimbursement — never built)
--   public.attendance_absences          (absence tracking — never built)
--   public.attendance_approvals_audit   (audit trail for the never-built absence approvals)
--   public.absence_reasons              (lookup for absence reason codes — children of the above)
--   public.project_geofences            (PostGIS geofence per project — never built; no ST_* queries anywhere)
--   public.company_settings             (per-company config — real config lives on companies.*)
--
-- Verification per table:
--   - Schema-qualified grep across routes/ lib/ services/ jobs/ middleware/
--     scripts/ tests/ seed.js + mep-frontend/src + mep-mobile/src: 0 hits each.
--   - Outside FK refs: only attendance_absences.reason_code → absence_reasons,
--     which is fully internal to this batch.
--   - Outside FK constraints from these tables: none.
--
-- Drop order: attendance_absences first (it has the FK to absence_reasons),
-- then everything else in any order. Single BEGIN/COMMIT, IF EXISTS for
-- idempotency.

BEGIN;

-- Drop the child first so the FK constraint resolves cleanly without CASCADE.
DROP TABLE IF EXISTS public.attendance_absences;
DROP TABLE IF EXISTS public.absence_reasons;

-- Independent tables (no inter-batch FKs).
DROP TABLE IF EXISTS public.attendance_approvals_audit;
DROP TABLE IF EXISTS public.borrow_requests;
DROP TABLE IF EXISTS public.early_checkout_requests;
DROP TABLE IF EXISTS public.parking_claims;
DROP TABLE IF EXISTS public.project_geofences;
DROP TABLE IF EXISTS public.company_settings;

COMMIT;
