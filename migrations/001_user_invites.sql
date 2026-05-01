-- Phase 59 (May 1, 2026) — adds the public.user_invites table.
--
-- Background: 5 backend routes already INSERT/UPDATE/SELECT this table
-- (admin_users.js, invite_employee.js, onboarding.js, user_invites.js,
-- user_management.js POST /:id/resend) but the table never existed in
-- the baseline schema. Every call past the validation guards 500'd in
-- prod with `relation "public.user_invites" does not exist`. Logged as
-- Bug 6 in DECISIONS.md (Section 18 bug table).
--
-- Columns below come from auditing every reference across those 5 routes
-- — see DECISIONS.md Phase 56 for the full spec rationale.

CREATE TABLE IF NOT EXISTS public.user_invites (
  id                  bigserial PRIMARY KEY,
  company_id          bigint NOT NULL,
  employee_id         bigint,
  email               text NOT NULL,
  role                text NOT NULL,
  token_hash          text NOT NULL UNIQUE,
  status              text NOT NULL DEFAULT 'ACTIVE',
  created_by_user_id  bigint,
  note                text,
  expires_at          timestamptz NOT NULL,
  sent_at             timestamptz,
  used_at             timestamptz,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_user_invites_status
    CHECK (status IN ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED'))
);

-- Used by user_management.js POST /:id/resend revoke-existing query:
--   WHERE company_id = $1 AND lower(email) = lower($2) AND status = 'ACTIVE'
CREATE INDEX IF NOT EXISTS idx_user_invites_company_email
  ON public.user_invites (company_id, lower(email));

-- Used by token-status filtering across multiple routes:
--   WHERE status = 'ACTIVE' / WHERE status IN ('ACTIVE', 'USED')
CREATE INDEX IF NOT EXISTS idx_user_invites_status
  ON public.user_invites (status);

-- token_hash UNIQUE constraint above creates an index automatically.

ALTER TABLE public.user_invites OWNER TO mepuser;

COMMENT ON TABLE public.user_invites IS
  'Activation invitations issued by admin_users / invite_employee / user_management /resend / user_invites flows. Token verified by onboarding /verify and burned by onboarding /complete. Phase 59 (May 2026) — see DECISIONS.md Bug 6 for the discovery story.';
