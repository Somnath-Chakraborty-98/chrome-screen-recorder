export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
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
