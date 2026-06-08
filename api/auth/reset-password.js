import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { hashPassword } from '../lib/auth-tokens.js';
import { handleOptions, readJsonBody, readRawBody } from '../lib/http.js';

function resetForm(token, errorMessage = '') {
  const errorHtml = errorMessage
    ? `<p style="color:#f87171;margin-bottom:12px;">${errorMessage}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset password — RecordEasy</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1115; color: #f3f4f6; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 12px; padding: 32px; width: min(420px, 92vw); }
    h1 { margin: 0 0 16px; font-size: 22px; }
    label { display: block; margin-bottom: 8px; color: #9ca3af; }
    input { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid #2a2f3a; background: #0f1115; color: #f3f4f6; margin-bottom: 16px; }
    button { width: 100%; padding: 11px; border: 0; border-radius: 8px; background: #3b82f6; color: white; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Reset password</h1>
    ${errorHtml}
    <form method="POST">
      <input type="hidden" name="token" value="${token}" />
      <label for="password">New password</label>
      <input id="password" name="password" type="password" minlength="8" required />
      <button type="submit">Update password</button>
    </form>
  </div>
</body>
</html>`;
}

function successPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Password updated — RecordEasy</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1115; color: #f3f4f6; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 12px; padding: 32px; max-width: 420px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Password updated</h1>
    <p>Open the RecordEasy extension and sign in with your new password.</p>
  </div>
</body>
</html>`;
}

async function processReset(token, password) {
  if (!token || !password || password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }

  const supabase = getSupabaseAdmin();
  const { data: row, error } = await supabase
    .from('recordeasy_password_resets')
    .select('id, user_id, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) throw new Error('This reset link is invalid or already used.');
  if (new Date(row.expires_at).getTime() < Date.now()) {
    throw new Error('This reset link has expired.');
  }

  const passwordHash = await hashPassword(password);
  const { error: updateError } = await supabase
    .from('recordeasy_users')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', row.user_id);

  if (updateError) throw new Error(updateError.message);

  await supabase.from('recordeasy_password_resets').delete().eq('id', row.id);
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const token = String(req.query?.token || req.body?.token || '').trim();

  if (req.method === 'GET') {
    if (!token) {
      res.status(400).send(resetForm('', 'Reset token is missing.'));
      return;
    }
    res.status(200).send(resetForm(token));
    return;
  }

  if (req.method === 'POST') {
    try {
      let password = '';
      let bodyToken = '';
      const contentType = req.headers['content-type'] || '';

      if (contentType.includes('application/json')) {
        const body = await readJsonBody(req);
        password = String(body.password || '');
        bodyToken = String(body.token || '').trim();
      } else {
        const raw = await readRawBody(req);
        const params = new URLSearchParams(raw);
        password = String(params.get('password') || '');
        bodyToken = String(params.get('token') || '').trim();
      }

      await processReset(bodyToken || token, password);
      res.status(200).send(successPage());
    } catch (error) {
      res.status(400).send(resetForm(token, error.message));
    }
    return;
  }

  res.status(405).send('Method not allowed');
}
