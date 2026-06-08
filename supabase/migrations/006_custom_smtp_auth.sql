-- RecordEasy custom SMTP auth (StanzaHR-style)
-- Replaces Supabase Auth with password_hash + email verification tokens on Vercel API.

BEGIN;

-- Drop Supabase Auth triggers (no longer used)
DROP TRIGGER IF EXISTS on_auth_user_created_recordeasy ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_email_verified_recordeasy ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_recordeasy_user();
DROP FUNCTION IF EXISTS public.handle_recordeasy_user_email_verified();

-- Decouple recordeasy_users from auth.users
ALTER TABLE public.recordeasy_users
  DROP CONSTRAINT IF EXISTS recordeasy_users_id_fkey;

ALTER TABLE public.recordeasy_users
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.recordeasy_users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- -----------------------------------------------------------------------------
-- Email verification tokens (signup)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recordeasy_email_verifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.recordeasy_users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recordeasy_email_verifications_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_recordeasy_email_verifications_user
  ON public.recordeasy_email_verifications (user_id);

CREATE INDEX IF NOT EXISTS idx_recordeasy_email_verifications_token
  ON public.recordeasy_email_verifications (token);

-- -----------------------------------------------------------------------------
-- Password reset tokens
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recordeasy_password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.recordeasy_users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recordeasy_password_resets_token_unique UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS idx_recordeasy_password_resets_user
  ON public.recordeasy_password_resets (user_id);

CREATE INDEX IF NOT EXISTS idx_recordeasy_password_resets_token
  ON public.recordeasy_password_resets (token);

-- Auth token tables are server-only (service role via Vercel)
ALTER TABLE public.recordeasy_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordeasy_password_resets ENABLE ROW LEVEL SECURITY;

COMMIT;
