/**
 * Optional post-signup hook — profile is created during /api/auth/signup.
 * Verifies custom JWT and returns entitlements (for future payment onboarding).
 */
import jwt from 'jsonwebtoken';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { handleOptions, sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, req, 405, { error: 'Method not allowed' });
  }

  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    return sendJson(res, req, 500, { error: 'Missing SUPABASE_JWT_SECRET on Vercel.' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return sendJson(res, req, 401, { error: 'Missing bearer token' });
  }

  let userId;
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
    userId = payload.sub;
  } catch {
    return sendJson(res, req, 401, { error: 'Invalid session' });
  }

  const supabase = getSupabaseAdmin();
  const { data: entitlements, error } = await supabase.rpc('get_recordeasy_entitlements', {
    p_user_id: userId
  });

  if (error) {
    return sendJson(res, req, 500, { error: error.message });
  }

  return sendJson(res, req, 200, {
    ok: true,
    entitlements: Array.isArray(entitlements) ? entitlements[0] : entitlements
  });
}
