import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, assertSupabaseConfig } from '../config.js';
import { chromeStorageAdapter } from './chrome-storage.js';

const configured = assertSupabaseConfig();

/** @type {import('@supabase/supabase-js').SupabaseClient|null} */
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: chromeStorageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      }
    })
  : null;
