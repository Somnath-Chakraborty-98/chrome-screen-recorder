import { getCurrentUser } from '../auth/auth-service.js';
import { supabase } from '../supabase/client.js';

/** @typedef {'low'|'medium'|'high'} QualityLevel */

/**
 * @typedef {Object} Entitlements
 * @property {string} planCode
 * @property {string} planName
 * @property {number} durationMinutes
 * @property {QualityLevel} maxQuality
 * @property {boolean} mp4Enabled
 * @property {boolean} watermarkEnabled
 * @property {boolean} customFilenameEnabled
 * @property {boolean} meetingCostEnabled
 * @property {boolean} isEarlyUser
 * @property {boolean} isLoggedIn
 * @property {number} priceInr
 * @property {number} priceUsd
 */

export const GUEST_ENTITLEMENTS = Object.freeze({
  planCode: 'free',
  planName: 'Free',
  durationMinutes: 30,
  maxQuality: 'low',
  mp4Enabled: false,
  watermarkEnabled: true,
  customFilenameEnabled: false,
  meetingCostEnabled: false,
  isEarlyUser: false,
  isLoggedIn: false,
  priceInr: 0,
  priceUsd: 0
});

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @returns {Entitlements}
 */
function mapEntitlementsRow(row) {
  if (!row) return { ...GUEST_ENTITLEMENTS, isLoggedIn: true };

  return {
    planCode: String(row.plan_code ?? 'free'),
    planName: String(row.plan_name ?? 'Free'),
    durationMinutes: Number(row.duration_minutes ?? 30),
    maxQuality: /** @type {QualityLevel} */ (row.max_quality ?? 'low'),
    mp4Enabled: Boolean(row.mp4_enabled),
    watermarkEnabled: Boolean(row.watermark_enabled),
    customFilenameEnabled: Boolean(row.custom_filename_enabled),
    meetingCostEnabled: Boolean(row.meeting_cost_enabled),
    isEarlyUser: Boolean(row.is_early_user),
    isLoggedIn: true,
    priceInr: Number(row.price_inr ?? 0),
    priceUsd: Number(row.price_usd ?? 0)
  };
}

/**
 * @returns {Promise<Entitlements>}
 */
export async function fetchEntitlements() {
  const user = await getCurrentUser();
  if (!user) return { ...GUEST_ENTITLEMENTS };

  if (!supabase) return { ...GUEST_ENTITLEMENTS, isLoggedIn: true };
  const { data, error } = await supabase.rpc('get_recordeasy_entitlements', {
    p_user_id: user.id
  });

  if (error) {
    console.warn('Entitlements fetch failed:', error.message);
    return { ...GUEST_ENTITLEMENTS, isLoggedIn: true };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return mapEntitlementsRow(row);
}

/**
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchPlans() {
  if (!supabase) throw new Error('Plans unavailable. Rebuild the extension with Supabase config.');
  const { data, error } = await supabase
    .from('recordeasy_plans')
    .select('*')
    .eq('is_active', true)
    .order('duration_minutes', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * @param {QualityLevel} quality
 * @param {Entitlements} entitlements
 */
export function canUseQuality(quality, entitlements) {
  const order = { low: 1, medium: 2, high: 3 };
  return order[quality] <= order[entitlements.maxQuality];
}
