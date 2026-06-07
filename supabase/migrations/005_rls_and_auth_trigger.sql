-- RecordEasy RLS policies + auth.users trigger
-- Run in Supabase SQL Editor after recordeasy tables exist

BEGIN;

-- -----------------------------------------------------------------------------
-- Auto-create recordeasy_users profile on Supabase Auth signup
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_recordeasy_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.recordeasy_users (id, name, email, email_verified)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    lower(NEW.email),
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = EXCLUDED.name,
    email_verified = EXCLUDED.email_verified,
    updated_at = NOW();

  PERFORM public.apply_recordeasy_early_user_perk(NEW.id, lower(NEW.email));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_recordeasy ON auth.users;
CREATE TRIGGER on_auth_user_created_recordeasy
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_recordeasy_user();

-- Keep email_verified in sync when user confirms email
CREATE OR REPLACE FUNCTION public.handle_recordeasy_user_email_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at) THEN
    UPDATE public.recordeasy_users
    SET email_verified = TRUE, updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_verified_recordeasy ON auth.users;
CREATE TRIGGER on_auth_user_email_verified_recordeasy
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_recordeasy_user_email_verified();

-- -----------------------------------------------------------------------------
-- Enable RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.recordeasy_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordeasy_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordeasy_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordeasy_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recordeasy_meeting_cost_sessions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- recordeasy_users
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS recordeasy_users_select_own ON public.recordeasy_users;
CREATE POLICY recordeasy_users_select_own
  ON public.recordeasy_users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS recordeasy_users_update_own ON public.recordeasy_users;
CREATE POLICY recordeasy_users_update_own
  ON public.recordeasy_users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- recordeasy_plans — public read for pricing page
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS recordeasy_plans_select_active ON public.recordeasy_plans;
CREATE POLICY recordeasy_plans_select_active
  ON public.recordeasy_plans FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

-- -----------------------------------------------------------------------------
-- recordeasy_subscriptions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS recordeasy_subscriptions_select_own ON public.recordeasy_subscriptions;
CREATE POLICY recordeasy_subscriptions_select_own
  ON public.recordeasy_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Inserts/updates via service role (Vercel webhooks) only for now

-- -----------------------------------------------------------------------------
-- recordeasy_settings
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS recordeasy_settings_select_own ON public.recordeasy_settings;
CREATE POLICY recordeasy_settings_select_own
  ON public.recordeasy_settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS recordeasy_settings_insert_own ON public.recordeasy_settings;
CREATE POLICY recordeasy_settings_insert_own
  ON public.recordeasy_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS recordeasy_settings_update_own ON public.recordeasy_settings;
CREATE POLICY recordeasy_settings_update_own
  ON public.recordeasy_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS recordeasy_settings_delete_own ON public.recordeasy_settings;
CREATE POLICY recordeasy_settings_delete_own
  ON public.recordeasy_settings FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- recordeasy_meeting_cost_sessions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS recordeasy_meeting_cost_select_own ON public.recordeasy_meeting_cost_sessions;
CREATE POLICY recordeasy_meeting_cost_select_own
  ON public.recordeasy_meeting_cost_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS recordeasy_meeting_cost_insert_own ON public.recordeasy_meeting_cost_sessions;
CREATE POLICY recordeasy_meeting_cost_insert_own
  ON public.recordeasy_meeting_cost_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- RPC grants for extension client
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.check_recordeasy_early_user(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_recordeasy_early_user_perk(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recordeasy_entitlements(UUID) TO authenticated;

COMMIT;
