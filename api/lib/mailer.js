import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS on Vercel.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return transporter;
}

function resolveFromAddress() {
  const user = process.env.SMTP_USER?.trim();
  const from = process.env.SMTP_FROM?.trim();

  if (!user) {
    throw new Error('SMTP_USER is not configured.');
  }

  if (!from) return user;

  // Already a full RFC address, e.g. RecordEasy <admin@metrivance.com>
  if (from.includes('@') && from.includes('<')) return from;

  // Bare email only
  if (from.includes('@')) return from;

  // Display name without email — Zoho requires the authenticated mailbox
  const label = from.replace(/"/g, '');
  return `"${label}" <${user}>`;
}

export async function sendMail({ to, subject, html, text }) {
  await getTransporter().sendMail({
    from: resolveFromAddress(),
    to,
    subject,
    html,
    text
  });
}
