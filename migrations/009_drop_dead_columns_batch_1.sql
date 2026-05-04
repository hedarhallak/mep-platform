-- Section 67/75 → C4 batch 1 — Drop 13 truly-dead columns from still-existing tables.
--
-- After C3 dropped 30 dead tables, only 14 of Section 66's original 95 dead
-- columns remained on still-existing tables. Re-audited each one with
-- schema-qualified grep (`<table>.<col>` patterns) AND FK-awareness checks.
--
-- One column from the 14 was dropped from this list — `public.roles.role_id`
-- — because it's the PRIMARY KEY of the `roles` table. The Section 66 audit
-- excluded `id` from its noise filter but `role_id` slipped through. Filed
-- as a tooling improvement: detector should also exclude PK columns.
--
-- Final list — 13 columns on 5 tables, all confirmed:
--   - 0 word-boundary refs in any code file
--   - 0 schema-qualified refs (`<table>.<col>` patterns)
--   - Not a FK source (their value isn't constrained by any FK)
--   - Not a FK target (no other table references them via FK)
--   - Not a primary key
--
-- Tables affected (5):
--
--   public.app_users           — 1 col   (profile_completed; superseded by profile_status)
--   public.companies           — 9 cols  (geofencing/dispatch/attendance config never wired)
--   public.employee_profiles   — 1 col   (home_distance_km — distance is computed at query-time)
--   public.plans               — 2 cols  (max_users, max_projects — billing limits never enforced)
--   public.user_permissions    — 1 col   (granted_by — never populated by any route)
--
-- Drop order is irrelevant because no FKs are involved. Single transaction
-- so a partial failure rolls back atomically.

BEGIN;

-- public.app_users — profile_status superseded profile_completed
ALTER TABLE public.app_users
  DROP COLUMN IF EXISTS profile_completed;

-- public.companies — config columns never wired to any feature
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS travel_origin_policy,
  DROP COLUMN IF EXISTS yard_lat,
  DROP COLUMN IF EXISTS yard_lng,
  DROP COLUMN IF EXISTS dispatch_time,
  DROP COLUMN IF EXISTS dispatch_timezone,
  DROP COLUMN IF EXISTS attendance_mode,
  DROP COLUMN IF EXISTS break_count,
  DROP COLUMN IF EXISTS break_minutes,
  DROP COLUMN IF EXISTS overtime_threshold_hours;

-- public.employee_profiles — distance is computed via PostGIS at query time
ALTER TABLE public.employee_profiles
  DROP COLUMN IF EXISTS home_distance_km;

-- public.plans — billing limits never enforced anywhere in code
ALTER TABLE public.plans
  DROP COLUMN IF EXISTS max_users,
  DROP COLUMN IF EXISTS max_projects;

-- public.user_permissions — granted_by never populated by any route
ALTER TABLE public.user_permissions
  DROP COLUMN IF EXISTS granted_by;

COMMIT;
