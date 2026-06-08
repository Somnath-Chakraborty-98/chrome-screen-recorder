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

export async function sendMail({ to, subject, html, text }) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransporter().sendMail({ from, to, subject, html, text });
}
