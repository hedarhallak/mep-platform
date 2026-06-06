-- migrations/028_session_activity_caps.sql
--
-- §133 (DECISIONS §137) — server-side session hardening for the SUPER_ADMIN
-- portal: idle timeout + absolute session cap enforced on /api/auth/refresh,
-- so the guarantee does NOT depend on client JS (the §133.4/§133.5 layers are
-- client-side and can be bypassed). Two new columns on refresh_tokens:
--
--   session_started_at TIMESTAMPTZ — when the SESSION began (initial login).
--                                    Carried forward UNCHANGED through every
--                                    token rotation, so the absolute cap is
--                                    measured from the real login, not from the
--                                    latest rotated token's created_at.
--   last_activity_at   TIMESTAMPTZ — last authenticated activity. Bumped by the
--                                    SUPER_ADMIN guard on every real admin
--                                    request (NOT on /refresh), so idle is
--                                    measured against true activity and an
--                                    active admin is never falsely logged out
--                                    even though /refresh only fires ~hourly.
--
-- Both default to NOW() so any pre-existing tokens are treated as "session
-- started now / active now" (fail-open on the cap, never locking out a live
-- session at deploy time).
--
-- GRANTs (Pitfall #49): NONE required. refresh_tokens is a baseline table
-- already owned by mepuser with full table-level privileges for the app roles;
-- table-level privileges cover columns added later. No RLS (refresh_tokens is
-- not in the migration 012/013 table list — it is queried pre-tenant).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DEFAULT now() makes re-running a no-op.

BEGIN;

ALTER TABLE public.refresh_tokens
  ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_activity_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.refresh_tokens.session_started_at IS
  'When the session began (initial login). Carried forward unchanged through rotations → absolute session cap. §133.';
COMMENT ON COLUMN public.refresh_tokens.last_activity_at IS
  'Last authenticated admin activity (bumped by the SUPER_ADMIN guard, not by /refresh) → server-side idle timeout. §133.';

COMMIT;
