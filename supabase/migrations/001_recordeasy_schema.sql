-- RecordEasy schema for Supabase
-- Integrates with existing waitlist tables: public.users, public.products, public.waitlist_entries
-- Early-user perk: watermark removal only (no plan upgrade)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_quality_level') THEN
    CREATE TYPE plan_quality_level AS ENUM ('low', 'medium', 'high');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE subscription_status AS ENUM (
      'active', 'expired', 'cancelled', 'trial', 'grace'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_cycle_type') THEN
    CREATE TYPE billing_cycle_type AS ENUM ('monthly', 'yearly', 'manual');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Waitlist product seed (idempotent)
INSERT INTO public.products (product_key, product_name)
VALUES ('record_easy', 'RecordEasy')
ON CONFLICT (product_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.recordeasy_users (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  email              TEXT NOT NULL,
  email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  early_user         BOOLEAN NOT NULL DEFAULT FALSE,
  waitlist_user_id   INTEGER NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT recordeasy_users_email_unique UNIQUE (email),
  CONSTRAINT recordeasy_users_email_lowercase_chk CHECK (email = lower(email)),
  CONSTRAINT recordeasy_users_name_not_blank_chk CHECK (length(trim(name)) > 0)
);

COMMENT ON TABLE public.recordeasy_users IS
  'RecordEasy profile linked to Supabase Auth. early_user grants watermark removal on Free.';
COMMENT ON COLUMN public.recordeasy_users.early_user IS
  'True when user joined waitlist for record_easy. Perk: watermark removed, plan stays unchanged.';

CREATE INDEX IF NOT EXISTS idx_recordeasy_users_email
  ON public.recordeasy_users (email);

CREATE INDEX IF NOT EXISTS idx_recordeasy_users_early_user
  ON public.recordeasy_users (early_user)
  WHERE early_user = TRUE;

DROP TRIGGER IF EXISTS trg_recordeasy_users_set_updated_at ON public.recordeasy_users;
CREATE TRIGGER trg_recordeasy_users_set_updated_at
  BEFORE UPDATE ON public.recordeasy_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.plans (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     TEXT NOT NULL,
  name                     TEXT NOT NULL,
  price_inr                NUMERIC(10, 2) NOT NULL DEFAULT 0,
  price_usd                NUMERIC(10, 2) NOT NULL DEFAULT 0,
  duration_minutes         INTEGER NOT NULL,
  max_quality              plan_quality_level NOT NULL,
  mp4_enabled              BOOLEAN NOT NULL DEFAULT FALSE,
  watermark_enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  custom_filename_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  meeting_cost_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT plans_code_unique UNIQUE (code),
  CONSTRAINT plans_code_format_chk CHECK (code ~ '^[a-z_]+$'),
  CONSTRAINT plans_duration_positive_chk CHECK (duration_minutes > 0),
  CONSTRAINT plans_price_non_negative_chk CHECK (price_inr >= 0 AND price_usd >= 0)
);

CREATE INDEX IF NOT EXISTS idx_plans_is_active
  ON public.plans (is_active)
  WHERE is_active = TRUE;

DROP TRIGGER IF EXISTS trg_plans_set_updated_at ON public.plans;
CREATE TRIGGER trg_plans_set_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.recordeasy_users(id) ON DELETE CASCADE,
  plan_id        UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status         subscription_status NOT NULL DEFAULT 'active',
  billing_cycle  billing_cycle_type NOT NULL DEFAULT 'manual',
  start_date     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_date       TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_subscriptions_date_order_chk CHECK (
    end_date IS NULL OR end_date >= start_date
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_subscriptions_one_active_per_user
  ON public.user_subscriptions (user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON public.user_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id
  ON public.user_subscriptions (plan_id);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status
  ON public.user_subscriptions (user_id, status);

DROP TRIGGER IF EXISTS trg_user_subscriptions_set_updated_at ON public.user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_set_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.user_settings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.recordeasy_users(id) ON DELETE CASCADE,
  setting_key    TEXT NOT NULL,
  setting_value  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_settings_user_key_unique UNIQUE (user_id, setting_key),
  CONSTRAINT user_settings_key_format_chk CHECK (setting_key ~ '^[a-z_]+$')
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id
  ON public.user_settings (user_id);

CREATE INDEX IF NOT EXISTS idx_user_settings_key
  ON public.user_settings (setting_key);

DROP TRIGGER IF EXISTS trg_user_settings_set_updated_at ON public.user_settings;
CREATE TRIGGER trg_user_settings_set_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.meeting_cost_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.recordeasy_users(id) ON DELETE CASCADE,
  recording_id      UUID,
  session_title     TEXT,
  hourly_rate       NUMERIC(12, 2) NOT NULL,
  duration_seconds  INTEGER NOT NULL,
  calculated_cost   NUMERIC(14, 2) NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL,
  ended_at          TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT meeting_cost_sessions_duration_positive_chk CHECK (duration_seconds > 0),
  CONSTRAINT meeting_cost_sessions_hourly_rate_non_negative_chk CHECK (hourly_rate >= 0),
  CONSTRAINT meeting_cost_sessions_calculated_cost_non_negative_chk CHECK (calculated_cost >= 0),
  CONSTRAINT meeting_cost_sessions_time_order_chk CHECK (ended_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_meeting_cost_sessions_user_started_at
  ON public.meeting_cost_sessions (user_id, started_at DESC);

-- Plan catalog (confirmed pricing)
INSERT INTO public.plans (
  code, name, price_inr, price_usd, duration_minutes, max_quality,
  mp4_enabled, watermark_enabled, custom_filename_enabled, meeting_cost_enabled, is_active
)
VALUES
  ('free', 'Free',   0.00,   0.00,  30,  'low',    FALSE, TRUE,  FALSE, FALSE, TRUE),
  ('plus', 'Plus', 499.00,   8.00,  60,  'medium', TRUE,  FALSE, TRUE,  TRUE,  TRUE),
  ('pro',  'Pro',  999.00,  18.00, 120,  'high',   TRUE,  FALSE, TRUE,  TRUE,  TRUE)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  price_inr = EXCLUDED.price_inr,
  price_usd = EXCLUDED.price_usd,
  duration_minutes = EXCLUDED.duration_minutes,
  max_quality = EXCLUDED.max_quality,
  mp4_enabled = EXCLUDED.mp4_enabled,
  watermark_enabled = EXCLUDED.watermark_enabled,
  custom_filename_enabled = EXCLUDED.custom_filename_enabled,
  meeting_cost_enabled = EXCLUDED.meeting_cost_enabled,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Check waitlist by email for record_easy
CREATE OR REPLACE FUNCTION public.check_recordeasy_early_user(p_email TEXT)
RETURNS TABLE (
  is_early_user BOOLEAN,
  waitlist_user_id INTEGER,
  waitlist_joined_at TIMESTAMPTZ,
  product_key TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    TRUE AS is_early_user,
    wu.id AS waitlist_user_id,
    we.joined_at::timestamptz AS waitlist_joined_at,
    p.product_key
  FROM public.users wu
  INNER JOIN public.waitlist_entries we ON we.user_id = wu.id
  INNER JOIN public.products p ON p.id = we.product_id
  WHERE lower(wu.email) = lower(p_email)
    AND p.product_key = 'record_easy'
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.check_recordeasy_early_user(TEXT) IS
  'Returns waitlist match for record_easy by email. Used at signup to set early_user.';

-- Apply early-user flag after signup (watermark removal only, no plan change)
CREATE OR REPLACE FUNCTION public.apply_recordeasy_early_user_perk(p_user_id UUID, p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_waitlist_user_id INTEGER;
  v_is_early BOOLEAN := FALSE;
BEGIN
  SELECT waitlist_user_id
  INTO v_waitlist_user_id
  FROM public.check_recordeasy_early_user(p_email)
  LIMIT 1;

  v_is_early := v_waitlist_user_id IS NOT NULL;

  IF v_is_early THEN
    UPDATE public.recordeasy_users
    SET
      early_user = TRUE,
      waitlist_user_id = v_waitlist_user_id,
      updated_at = NOW()
    WHERE id = p_user_id;
  END IF;

  RETURN v_is_early;
END;
$$;

COMMENT ON FUNCTION public.apply_recordeasy_early_user_perk(UUID, TEXT) IS
  'Marks user as early_user when email exists in waitlist for record_easy. Perk: no watermark.';

-- Effective entitlements (plan + early_user watermark override)
CREATE OR REPLACE FUNCTION public.get_recordeasy_entitlements(p_user_id UUID)
RETURNS TABLE (
  plan_code TEXT,
  plan_name TEXT,
  duration_minutes INTEGER,
  max_quality plan_quality_level,
  mp4_enabled BOOLEAN,
  watermark_enabled BOOLEAN,
  custom_filename_enabled BOOLEAN,
  meeting_cost_enabled BOOLEAN,
  is_early_user BOOLEAN,
  price_inr NUMERIC(10, 2),
  price_usd NUMERIC(10, 2)
)
LANGUAGE sql
STABLE
AS $$
  WITH profile AS (
    SELECT ru.id, ru.early_user
    FROM public.recordeasy_users ru
    WHERE ru.id = p_user_id
  ),
  active_plan AS (
    SELECT p.*
    FROM public.user_subscriptions us
    INNER JOIN public.plans p ON p.id = us.plan_id
    WHERE us.user_id = p_user_id
      AND us.status = 'active'
    ORDER BY us.start_date DESC
    LIMIT 1
  ),
  resolved_plan AS (
    SELECT *
    FROM active_plan
    UNION ALL
    SELECT p.*
    FROM public.plans p
    WHERE p.code = 'free'
      AND NOT EXISTS (SELECT 1 FROM active_plan)
    LIMIT 1
  )
  SELECT
    rp.code AS plan_code,
    rp.name AS plan_name,
    rp.duration_minutes,
    rp.max_quality,
    rp.mp4_enabled,
    CASE
      WHEN pr.early_user THEN FALSE
      ELSE rp.watermark_enabled
    END AS watermark_enabled,
    rp.custom_filename_enabled,
    rp.meeting_cost_enabled,
    COALESCE(pr.early_user, FALSE) AS is_early_user,
    rp.price_inr,
    rp.price_usd
  FROM resolved_plan rp
  CROSS JOIN profile pr;
$$;

COMMENT ON FUNCTION public.get_recordeasy_entitlements(UUID) IS
  'Returns effective entitlements. early_user removes watermark even on Free plan.';

COMMIT;
