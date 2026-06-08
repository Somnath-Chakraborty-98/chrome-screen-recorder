import { API_BASE_URL } from '../config.js';
import { supabase } from '../supabase/client.js';

const SESSION_KEY = 'recordeasy.auth.session';

async function apiFetch(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('Auth API unavailable. Set VITE_API_BASE_URL in .env and rebuild.');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

async function saveSession(session) {
  await chrome.storage.local.set({ [SESSION_KEY]: session });
  if (supabase && session?.access_token) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.access_token
    });
  }
}

async function clearSession() {
  await chrome.storage.local.remove(SESSION_KEY);
  if (supabase) {
    await supabase.auth.signOut();
  }
}

/**
 * Restore JWT session into the Supabase client for RLS-protected queries.
 * @returns {Promise<{ access_token: string, user: object }|null>}
 */
export async function restoreAuthSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const session = stored[SESSION_KEY] ?? null;
  if (session?.access_token && supabase) {
    await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.access_token
    });
  }
  return session;
}

/**
 * @returns {Promise<{ access_token: string, user: object }|null>}
 */
export async function getSession() {
  const stored = await chrome.storage.local.get(SESSION_KEY);
  return stored[SESSION_KEY] ?? null;
}

/**
 * @returns {Promise<{ id: string, email: string, name: string }|null>}
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function signUp({ email, password, name }) {
  const data = await apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, name })
  });

  return { user: data.user, session: null };
}

export async function signIn({ email, password }) {
  const data = await apiFetch('/api/auth/signin', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  await saveSession({
    access_token: data.access_token,
    user: data.user
  });

  if (data.user) {
    await applyEarlyUserPerkIfEligible(data.user.id, email);
  }

  return { user: data.user, session: await getSession() };
}

export async function signOut() {
  await clearSession();
}

export async function resetPassword(email) {
  await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
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
