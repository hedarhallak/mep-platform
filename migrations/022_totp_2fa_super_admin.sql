-- migrations/022_totp_2fa_super_admin.sql
--
-- Phase 6-D-6.5 / Section 120.5 / Section 121 — TOTP 2FA for SUPER_ADMIN.
--
-- Adds three columns to public.app_users to store an AES-256-GCM-encrypted
-- TOTP secret per user. The encryption key (TOTP_ENCRYPTION_KEY in .env) is
-- 32 raw bytes (hex-encoded) and lives outside the database, so a DB-only
-- leak does not expose the TOTP secrets.
--
-- Columns:
--   - totp_secret_encrypted (BYTEA, NULL):
--       AES-256-GCM ciphertext of the raw TOTP secret (the seed otplib uses
--       to derive 6-digit codes). NULL = user has not enrolled in TOTP yet.
--   - totp_iv (BYTEA, NULL):
--       12-byte (96-bit) random IV / nonce used during encryption. Persisted
--       per row so decryption can be deterministic.
--   - totp_auth_tag (BYTEA, NULL):
--       16-byte authentication tag from the GCM cipher. Used by Node's
--       createDecipheriv to verify integrity of the ciphertext on decrypt.
--   - totp_enabled_at (TIMESTAMPTZ, NULL):
--       When the user successfully confirmed their first TOTP code. While
--       this is NULL we are in "setup required" mode for the user.
--
-- This migration is forward-compatible with Phase 6-D-6.7 (extending TOTP to
-- COMPANY_ADMIN). No role gating is enforced at the column level — the
-- decision of WHO requires TOTP lives in the auth middleware + AdminLogin
-- flow. Today only SUPER_ADMIN is enforced (TOTP_ENFORCE flag + role check).
--
-- Idempotent: re-running the migration is a no-op.

BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS totp_secret_encrypted BYTEA,
  ADD COLUMN IF NOT EXISTS totp_iv               BYTEA,
  ADD COLUMN IF NOT EXISTS totp_auth_tag         BYTEA,
  ADD COLUMN IF NOT EXISTS totp_enabled_at       TIMESTAMPTZ;

COMMENT ON COLUMN public.app_users.totp_secret_encrypted IS
  'AES-256-GCM ciphertext of the user''s TOTP secret. NULL = not enrolled. Section 121.';
COMMENT ON COLUMN public.app_users.totp_iv IS
  '12-byte IV used to encrypt totp_secret_encrypted. Section 121.';
COMMENT ON COLUMN public.app_users.totp_auth_tag IS
  '16-byte GCM auth tag used to verify totp_secret_encrypted integrity. Section 121.';
COMMENT ON COLUMN public.app_users.totp_enabled_at IS
  'Timestamp of first successful TOTP verification. NULL = setup required. Section 121.';

-- Partial index so the auth route can quickly find users that still need
-- to enroll. Cheap on small tables; covers the "force setup wizard on
-- first SUPER_ADMIN login" lookup.
CREATE INDEX IF NOT EXISTS idx_app_users_totp_pending
  ON public.app_users(role)
  WHERE totp_enabled_at IS NULL;

COMMIT;
