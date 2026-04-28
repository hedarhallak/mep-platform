-- db/migrations/016_assignment_role.sql
-- Add assignment_role to assignment_requests
-- Decouples the role a person plays on a project from their global role_code.
-- Same employee can be FOREMAN on project A and WORKER on project B.

BEGIN;

ALTER TABLE public.assignment_requests
  ADD COLUMN IF NOT EXISTS assignment_role TEXT
    NOT NULL DEFAULT 'WORKER'
    CHECK (assignment_role IN ('WORKER', 'FOREMAN', 'JOURNEYMAN'));

-- Backfill existing rows: if employee's role_code = 'FOREMAN' → set FOREMAN, else WORKER
UPDATE public.assignment_requests ar
SET assignment_role = 'FOREMAN'
FROM public.employee_profiles ep
WHERE ep.employee_id = ar.requested_for_employee_id
  AND ep.role_code = 'FOREMAN'
  AND ar.assignment_role = 'WORKER';

CREATE INDEX IF NOT EXISTS idx_assignment_requests_role
  ON public.assignment_requests(assignment_role);

COMMIT;
