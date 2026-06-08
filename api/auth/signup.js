import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { sendMail } from '../lib/mailer.js';
import {
  hashPassword,
  createOpaqueToken,
  verificationExpiry,
  getApiBaseUrl
} from '../lib/auth-tokens.js';
import { handleOptions, sendJson, readJsonBody } from '../lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, req, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!name || !email || !password) {
      return sendJson(res, req, 400, { error: 'Name, email, and password are required.' });
    }

    if (password.length < 8) {
      return sendJson(res, req, 400, { error: 'Password must be at least 8 characters.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase
      .from('recordeasy_users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      return sendJson(res, req, 409, { error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const { data: user, error: insertError } = await supabase
      .from('recordeasy_users')
      .insert({
        name,
        email,
        password_hash: passwordHash,
        email_verified: false
      })
      .select('id, name, email, email_verified')
      .single();

    if (insertError) {
      return sendJson(res, req, 500, { error: insertError.message });
    }

    await supabase.rpc('apply_recordeasy_early_user_perk', {
      p_user_id: user.id,
      p_email: email
    });

    const token = createOpaqueToken();
    const { error: tokenError } = await supabase.from('recordeasy_email_verifications').insert({
      user_id: user.id,
      token,
      expires_at: verificationExpiry()
    });

    if (tokenError) {
      return sendJson(res, req, 500, { error: tokenError.message });
    }

    const verifyUrl = `${getApiBaseUrl()}/api/auth/verify-email?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Verify your RecordEasy account',
      text: `Hi ${name},\n\nVerify your email to start using RecordEasy:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: `
        <p>Hi ${name},</p>
        <p>Verify your email to start using RecordEasy:</p>
        <p><a href="${verifyUrl}">Verify email</a></p>
        <p>This link expires in 24 hours.</p>
      `
    });

    return sendJson(res, req, 200, {
      ok: true,
      user: { id: user.id, email: user.email, name: user.name },
      message: 'Account created. Check your email to verify, then sign in.'
    });
  } catch (error) {
    console.error('signup error:', error);
    return sendJson(res, req, 500, { error: error.message || 'Sign up failed.' });
  }
}
