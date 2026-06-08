import { SUPABASE_URL } from '../config.js';
import { supabase } from '../supabase/client.js';

const AUTH_REDIRECT_URL =
  import.meta.env.VITE_AUTH_REDIRECT_URL ||
  `${SUPABASE_URL}/auth/v1/callback`;

const AUTH_STORAGE_KEYS = ['supabase.auth.token'];

/**
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/**
 * @returns {Promise<import('@supabase/supabase-js').User|null>}
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function signUp({ email, password, name }) {
  if (!supabase) throw new Error('Sign in is unavailable. Rebuild the extension with Supabase config.');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name }
    }
  });
  if (error) throw error;

  if (data.user) {
    await applyEarlyUserPerkIfEligible(data.user.id, email);
  }

  return data;
}

export async function signIn({ email, password }) {
  if (!supabase) throw new Error('Sign in is unavailable. Rebuild the extension with Supabase config.');
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;

  if (data.user) {
    await applyEarlyUserPerkIfEligible(data.user.id, email);
    await syncEmailVerified(data.user);
  }

  return data;
}

export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  await chrome.storage.local.remove(AUTH_STORAGE_KEYS);
}

export async function resetPassword(email) {
  if (!supabase) throw new Error('Password reset is unavailable. Rebuild the extension with Supabase config.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: AUTH_REDIRECT_URL
  });
  if (error) throw error;
}

async function applyEarlyUserPerkIfEligible(userId, email) {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc('apply_recordeasy_early_user_perk', {
      p_user_id: userId,
      p_email: email.toLowerCase()
    });
    if (error) {
      console.warn('Early user perk check failed:', error.message);
      return false;
    }
    return Boolean(data);
  } catch (e) {
    console.warn('Early user perk check error:', e);
    return false;
  }
}

async function syncEmailVerified(user) {
  if (!user.email_confirmed_at) return;

  if (!supabase) return;
  const { error } = await supabase
    .from('recordeasy_users')
    .update({ email_verified: true, updated_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) {
    console.warn('Failed to sync email_verified:', error.message);
  }
}
