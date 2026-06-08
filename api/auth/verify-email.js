import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { handleOptions } from '../lib/http.js';

function htmlPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #0f1115; color: #f3f4f6; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .card { background: #1a1d24; border: 1px solid #2a2f3a; border-radius: 12px; padding: 32px; max-width: 420px; text-align: center; }
    h1 { margin: 0 0 12px; font-size: 22px; }
    p { margin: 0; color: #9ca3af; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).send('Method not allowed');
    return;
  }

  const token = String(req.query?.token || '').trim();
  if (!token) {
    res.status(400).send(htmlPage('Invalid link', 'Verification token is missing.'));
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from('recordeasy_email_verifications')
      .select('id, user_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (error) {
      res.status(500).send(htmlPage('Error', error.message));
      return;
    }

    if (!row) {
      res.status(404).send(htmlPage('Invalid link', 'This verification link is invalid or already used.'));
      return;
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      res.status(410).send(htmlPage('Link expired', 'This verification link has expired. Sign up again or contact support.'));
      return;
    }

    const { error: updateError } = await supabase
      .from('recordeasy_users')
      .update({ email_verified: true, updated_at: new Date().toISOString() })
      .eq('id', row.user_id);

    if (updateError) {
      res.status(500).send(htmlPage('Error', updateError.message));
      return;
    }

    await supabase.from('recordeasy_email_verifications').delete().eq('id', row.id);

    res
      .status(200)
      .send(
        htmlPage(
          'Email verified',
          'Your email is verified. Open the RecordEasy extension and sign in.'
        )
      );
  } catch (error) {
    console.error('verify-email error:', error);
    res.status(500).send(htmlPage('Error', error.message || 'Verification failed.'));
  }
}
