-- db/migrations/024_task_message_delivery.sql
-- Adds delivery status to task_messages
-- Auto-delivers pending tasks when assignment is created

BEGIN;

-- ── 1. Add delivery_status to task_messages ───────────────────
ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'SENT';
-- Values: 'SENT' | 'PENDING_ASSIGNMENT'

-- Update existing rows
UPDATE public.task_messages SET delivery_status = 'SENT' WHERE delivery_status IS NULL;

-- ── 2. Add project_id + assignment context to task_recipients ──
ALTER TABLE public.task_recipients
  ADD COLUMN IF NOT EXISTS expected_project_id BIGINT REFERENCES public.projects(id) ON DELETE SET NULL;
-- When NULL = already delivered. When set = waiting for this assignment.

-- ── 3. Function: deliver pending tasks on new assignment ───────
CREATE OR REPLACE FUNCTION public.deliver_pending_tasks()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new assignment is created, find any pending task_recipients
  -- for this employee on this project and mark them as delivered
  UPDATE public.task_recipients
  SET
    status               = 'SENT',
    expected_project_id  = NULL,
    created_at           = NOW()
  WHERE
    recipient_id        = NEW.employee_id
    AND expected_project_id = NEW.project_id
    AND status          = 'PENDING';

  -- If all recipients of a message are now delivered, update message status
  UPDATE public.task_messages tm
  SET delivery_status = 'SENT'
  WHERE
    tm.delivery_status = 'PENDING_ASSIGNMENT'
    AND NOT EXISTS (
      SELECT 1 FROM public.task_recipients tr
      WHERE tr.message_id = tm.id
        AND tr.status = 'PENDING'
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4. Trigger on assignments table ──────────────────────────
DROP TRIGGER IF EXISTS trg_deliver_pending_tasks ON public.assignments;
CREATE TRIGGER trg_deliver_pending_tasks
  AFTER INSERT ON public.assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.deliver_pending_tasks();

-- ── 5. Also trigger on assignment_requests approval ──────────
-- (when status changes to APPROVED, a real assignment is created)
-- This is handled via the assignments INSERT trigger above.

COMMIT;
