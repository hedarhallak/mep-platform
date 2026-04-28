-- db/migrations/SAFE_013_employees_unique_email_norm.sql
-- Step A (DB Guard): enforce one email per employee (case-insensitive).
-- Additive only. Prevents duplicates at DB level.
-- Ignores NULL/blank emails via a partial index.

CREATE UNIQUE INDEX IF NOT EXISTS ux_employees_email_norm
ON public.employees (lower(email))
WHERE email IS NOT NULL AND btrim(email) <> '';
