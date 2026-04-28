-- Migration 029: Push Notification Tokens
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token         TEXT NOT NULL,
  platform      VARCHAR(10) NOT NULL DEFAULT 'ios',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens(user_id);
