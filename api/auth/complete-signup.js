/**
 * Vercel serverless — optional post-signup hook.
 * Primary profile creation runs via Supabase auth trigger (005 migration).
 * Use this route later for payment onboarding or waitlist sync edge cases.
 */
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({
      error: 'Server misconfigured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on Vercel.'
    });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  const user = userData.user;
  const email = user.email?.toLowerCase();
  const name = user.user_metadata?.name || email?.split('@')[0] || 'User';

  const { error: profileError } = await supabaseAdmin.from('recordeasy_users').upsert(
    {
      id: user.id,
      name,
      email,
      email_verified: Boolean(user.email_confirmed_at)
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  const { data: isEarly, error: perkError } = await supabaseAdmin.rpc(
    'apply_recordeasy_early_user_perk',
    { p_user_id: user.id, p_email: email }
  );

  if (perkError) {
    return res.status(500).json({ error: perkError.message });
  }

  const { data: entitlements, error: entError } = await supabaseAdmin.rpc(
    'get_recordeasy_entitlements',
    { p_user_id: user.id }
  );

  if (entError) {
    return res.status(500).json({ error: entError.message });
  }

  return res.status(200).json({
    ok: true,
    earlyUser: Boolean(isEarly),
    entitlements: Array.isArray(entitlements) ? entitlements[0] : entitlements
  });
}
