-- 031: Refresh tokens table for secure token rotation
-- Access token: short-lived (1 hour)
-- Refresh token: long-lived (7 days), stored in DB, revocable

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token_hash    VARCHAR(128) NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked       BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  user_agent    TEXT,
  ip_address    VARCHAR(45)
);

CREATE INDEX idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON public.refresh_tokens(expires_at);

-- Cleanup: auto-delete expired tokens older than 30 days
-- Run periodically: DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '30 days';
