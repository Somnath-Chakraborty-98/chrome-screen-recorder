import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { sendMail } from '../lib/mailer.js';
import { createOpaqueToken, resetExpiry, getApiBaseUrl } from '../lib/auth-tokens.js';
import { handleOptions, sendJson, readJsonBody } from '../lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, req, 405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();

    if (!email) {
      return sendJson(res, req, 400, { error: 'Email is required.' });
    }

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from('recordeasy_users')
      .select('id, name, email')
      .eq('email', email)
      .maybeSingle();

    // Always return success to avoid email enumeration
    if (!user) {
      return sendJson(res, req, 200, {
        ok: true,
        message: 'If that email exists, a reset link has been sent.'
      });
    }

    await supabase.from('recordeasy_password_resets').delete().eq('user_id', user.id);

    const token = createOpaqueToken();
    await supabase.from('recordeasy_password_resets').insert({
      user_id: user.id,
      token,
      expires_at: resetExpiry()
    });

    const resetUrl = `${getApiBaseUrl()}/api/auth/reset-password?token=${token}`;
    await sendMail({
      to: user.email,
      subject: 'Reset your RecordEasy password',
      text: `Hi ${user.name},\n\nReset your password:\n${resetUrl}\n\nThis link expires in 1 hour.`,
      html: `
        <p>Hi ${user.name},</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link expires in 1 hour.</p>
      `
    });

    return sendJson(res, req, 200, {
      ok: true,
      message: 'If that email exists, a reset link has been sent.'
    });
  } catch (error) {
    console.error('forgot-password error:', error);
    return sendJson(res, req, 500, { error: error.message || 'Could not send reset email.' });
  }
}
