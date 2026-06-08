export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
function normalizeApiBaseUrl(value) {
  const trimmed = String(value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function isAuthConfigured() {
  return Boolean(isSupabaseConfigured() && API_BASE_URL);
}

export function assertSupabaseConfig() {
  if (!isSupabaseConfigured()) {
    console.warn(
      'Missing Supabase config. Copy .env.example to .env and run npm run build. Auth features disabled.'
    );
    return false;
  }
  return true;
}
