-- Section 67/72 → C3 batch 4 — Drop the entire dead `erp` schema.
--
-- The Section 66 audit flagged 2 erp.* tables (erp.employee_projects,
-- erp.work_logs) but missed two more (erp.employees, erp.projects)
-- because the audit's word-boundary grep can't distinguish between
-- public.employees / erp.employees (and same for projects). After
-- adjusting the grep to be schema-qualified, ALL of the erp schema
-- turns out to be dead — including the 4 tables, 2 functions, and
-- the sequences/triggers wired to them.
--
-- Final-pass verification (schema-qualified grep across the whole
-- codebase, including frontend + mobile):
--   `erp.employees`, `erp.projects`, `erp.employee_projects`,
--   `erp.work_logs`, `erp.haversine_km`, `erp.tg_set_updated_at`
--   → 0 references everywhere.
--
-- All FKs and triggers inside the schema reference only other erp.*
-- objects — no cross-schema dependencies into public.* either way.
--
-- The simplest correct drop is `DROP SCHEMA erp CASCADE`. CASCADE
-- removes:
--   - 4 tables (employees, projects, employee_projects, work_logs)
--   - 2 functions (haversine_km, tg_set_updated_at)
--   - sequences (employees_id_seq, etc.)
--   - 8 FK constraints (all internal to the schema)
--   - 4 BEFORE UPDATE triggers calling tg_set_updated_at
-- in the right order and atomically.
--
-- The Section 66 audit's missing-2-tables-detection bug is also a
-- Section 67 follow-up — added to the tooling backlog: schema-aware
-- audit detector (treat public.X and erp.X as distinct).

BEGIN;

DROP SCHEMA IF EXISTS erp CASCADE;

COMMIT;
