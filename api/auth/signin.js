import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { verifyPassword, signAccessToken } from '../lib/auth-tokens.js';
import { handleOptions, sendJson, readJsonBody } from '../lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, req, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return sendJson(res, req, 400, { error: 'Email and password are required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from('recordeasy_users')
      .select('id, name, email, email_verified, password_hash')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      return sendJson(res, req, 500, { error: error.message });
    }

    if (!user || !user.password_hash) {
      return sendJson(res, req, 401, { error: 'Invalid email or password.' });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return sendJson(res, req, 401, { error: 'Invalid email or password.' });
    }

    if (!user.email_verified) {
      return sendJson(res, req, 403, {
        error: 'Please verify your email before signing in. Check your inbox for the verification link.'
      });
    }

    const accessToken = signAccessToken(user);

    return sendJson(res, req, 200, {
      ok: true,
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified
      }
    });
  } catch (error) {
    console.error('signin error:', error);
    return sendJson(res, req, 500, { error: error.message || 'Sign in failed.' });
  }
}
