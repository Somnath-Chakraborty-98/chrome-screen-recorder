-- =============================================================================
-- Prefix unprefixed RecordEasy tables with recordeasy_
-- Safe to run if you executed 001_recordeasy_schema.sql
--
-- Renames ONLY:
--   plans                    → recordeasy_plans
--   user_subscriptions       → recordeasy_subscriptions
--   user_settings            → recordeasy_settings
--   meeting_cost_sessions    → recordeasy_meeting_cost_sessions
--
-- Leaves unchanged:
--   recordeasy_users (already prefixed)
--   waitlist tables: users, products, waitlist_entries, etc.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) Rename tables (only when old exists and new does not)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.plans') IS NOT NULL
     AND to_regclass('public.recordeasy_plans') IS NULL THEN
    ALTER TABLE public.plans RENAME TO recordeasy_plans;
  END IF;

  IF to_regclass('public.user_subscriptions') IS NOT NULL
     AND to_regclass('public.recordeasy_subscriptions') IS NULL THEN
    ALTER TABLE public.user_subscriptions RENAME TO recordeasy_subscriptions;
  END IF;

  IF to_regclass('public.user_settings') IS NOT NULL
     AND to_regclass('public.recordeasy_settings') IS NULL THEN
    ALTER TABLE public.user_settings RENAME TO recordeasy_settings;
  END IF;

  IF to_regclass('public.meeting_cost_sessions') IS NOT NULL
     AND to_regclass('public.recordeasy_meeting_cost_sessions') IS NULL THEN
    ALTER TABLE public.meeting_cost_sessions RENAME TO recordeasy_meeting_cost_sessions;
  END IF;

  -- In case you named it meeting_cost_calculator manually
  IF to_regclass('public.meeting_cost_calculator') IS NOT NULL
     AND to_regclass('public.recordeasy_meeting_cost_sessions') IS NULL THEN
    ALTER TABLE public.meeting_cost_calculator RENAME TO recordeasy_meeting_cost_sessions;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Drop old triggers (table renames keep triggers, but names are stale)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_plans_set_updated_at ON public.recordeasy_plans;
DROP TRIGGER IF EXISTS trg_user_subscriptions_set_updated_at ON public.recordeasy_subscriptions;
DROP TRIGGER IF EXISTS trg_user_settings_set_updated_at ON public.recordeasy_settings;

-- Ensure shared updated_at function exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recordeasy_plans_set_updated_at
  BEFORE UPDATE ON public.recordeasy_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_recordeasy_subscriptions_set_updated_at
  BEFORE UPDATE ON public.recordeasy_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_recordeasy_settings_set_updated_at
  BEFORE UPDATE ON public.recordeasy_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Rename indexes for consistency (optional, safe if present)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.idx_plans_is_active') IS NOT NULL THEN
    ALTER INDEX public.idx_plans_is_active RENAME TO idx_recordeasy_plans_is_active;
  END IF;

  IF to_regclass('public.uq_user_subscriptions_one_active_per_user') IS NOT NULL THEN
    ALTER INDEX public.uq_user_subscriptions_one_active_per_user
      RENAME TO uq_recordeasy_subscriptions_one_active_per_user;
  END IF;

  IF to_regclass('public.idx_user_subscriptions_user_id') IS NOT NULL THEN
    ALTER INDEX public.idx_user_subscriptions_user_id
      RENAME TO idx_recordeasy_subscriptions_user_id;
  END IF;

  IF to_regclass('public.idx_user_subscriptions_plan_id') IS NOT NULL THEN
    ALTER INDEX public.idx_user_subscriptions_plan_id
      RENAME TO idx_recordeasy_subscriptions_plan_id;
  END IF;

  IF to_regclass('public.idx_user_subscriptions_user_status') IS NOT NULL THEN
    ALTER INDEX public.idx_user_subscriptions_user_status
      RENAME TO idx_recordeasy_subscriptions_user_status;
  END IF;

  IF to_regclass('public.idx_user_settings_user_id') IS NOT NULL THEN
    ALTER INDEX public.idx_user_settings_user_id RENAME TO idx_recordeasy_settings_user_id;
  END IF;

  IF to_regclass('public.idx_user_settings_key') IS NOT NULL THEN
    ALTER INDEX public.idx_user_settings_key RENAME TO idx_recordeasy_settings_key;
  END IF;

  IF to_regclass('public.idx_meeting_cost_sessions_user_started_at') IS NOT NULL THEN
    ALTER INDEX public.idx_meeting_cost_sessions_user_started_at
      RENAME TO idx_recordeasy_meeting_cost_sessions_user_started_at;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4) Update entitlements function to use prefixed table names
-- -----------------------------------------------------------------------------
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
    FROM public.recordeasy_subscriptions rs
    INNER JOIN public.recordeasy_plans p ON p.id = rs.plan_id
    WHERE rs.user_id = p_user_id
      AND rs.status = 'active'
    ORDER BY rs.start_date DESC
    LIMIT 1
  ),
  resolved_plan AS (
    SELECT * FROM active_plan
    UNION ALL
    SELECT p.*
    FROM public.recordeasy_plans p
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

COMMIT;

-- -----------------------------------------------------------------------------
-- Verify
-- -----------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND (
--     table_name LIKE 'recordeasy_%'
--     OR table_name IN ('plans','user_subscriptions','user_settings','meeting_cost_sessions')
--   )
-- ORDER BY table_name;
