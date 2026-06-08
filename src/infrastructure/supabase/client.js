import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, assertSupabaseConfig } from '../config.js';

const configured = assertSupabaseConfig();

/** @type {import('@supabase/supabase-js').SupabaseClient|null} */
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      }
    })
  : null;
