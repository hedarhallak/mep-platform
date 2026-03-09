-- db/migrations/002_assignment_requests.sql
-- Creates assignment_requests inbox table for Assignments V2

BEGIN;

-- 1) Table
CREATE TABLE IF NOT EXISTS public.assignment_requests (
  id BIGSERIAL PRIMARY KEY,

  request_type TEXT NOT NULL CHECK (request_type IN ('CREATE_ASSIGNMENT', 'UPDATE_ASSIGNMENT', 'CANCEL_ASSIGNMENT')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED')),

  requested_by_user_id BIGINT NOT NULL,
  requested_for_employee_id BIGINT NOT NULL,
  project_id BIGINT NOT NULL,

  start_date DATE NULL,
  end_date DATE NULL,

  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,

  decision_by_user_id BIGINT NULL,
  decision_note TEXT NULL,
  decision_at TIMESTAMPTZ NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Indexes
CREATE INDEX IF NOT EXISTS idx_assignment_requests_status
  ON public.assignment_requests(status);

CREATE INDEX IF NOT EXISTS idx_assignment_requests_requested_by
  ON public.assignment_requests(requested_by_user_id);

CREATE INDEX IF NOT EXISTS idx_assignment_requests_employee
  ON public.assignment_requests(requested_for_employee_id);

CREATE INDEX IF NOT EXISTS idx_assignment_requests_project
  ON public.assignment_requests(project_id);

CREATE INDEX IF NOT EXISTS idx_assignment_requests_created_at
  ON public.assignment_requests(created_at);

-- 3) updated_at trigger (shared helper)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assignment_requests_updated_at ON public.assignment_requests;

CREATE TRIGGER trg_assignment_requests_updated_at
BEFORE UPDATE ON public.assignment_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

COMMIT;
