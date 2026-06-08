import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = 12;
const VERIFY_TTL_HOURS = 24;
const RESET_TTL_HOURS = 1;
const JWT_TTL_DAYS = 7;

export function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function createOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function verificationExpiry() {
  return new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function resetExpiry() {
  return new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

export function signAccessToken(user) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error('Missing SUPABASE_JWT_SECRET on Vercel.');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + JWT_TTL_DAYS * 24 * 60 * 60;

  return jwt.sign(
    {
      aud: 'authenticated',
      exp,
      iat: now,
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      user_metadata: { name: user.name }
    },
    secret,
    { algorithm: 'HS256' }
  );
}

export function getApiBaseUrl() {
  if (process.env.API_BASE_URL) return process.env.API_BASE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}
