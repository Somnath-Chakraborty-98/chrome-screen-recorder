import { getCurrentUser } from '../../infrastructure/auth/auth-service.js';
import { supabase } from '../../infrastructure/supabase/client.js';

/**
 * @typedef {Object} MeetingCostState
 * @property {boolean} enabled
 * @property {number} hourlyRate
 * @property {number|null} startedAt
 * @property {number} elapsedSeconds
 */

/**
 * @param {number} hourlyRate
 * @param {number} durationSeconds
 */
export function calculateMeetingCost(hourlyRate, durationSeconds) {
  return Number(((hourlyRate / 3600) * durationSeconds).toFixed(2));
}

/**
 * @param {number} durationSeconds
 * @param {MeetingCostState} state
 */
export function formatCostSummary(durationSeconds, state) {
  if (!state.enabled || !state.hourlyRate) return '';
  const cost = calculateMeetingCost(state.hourlyRate, durationSeconds);
  return `Meeting cost: ₹${cost.toLocaleString('en-IN')} (${state.hourlyRate}/hr)`;
}

/**
 * @param {{
 *   durationSeconds: number,
 *   hourlyRate: number,
 *   sessionTitle?: string,
 *   startedAt: number,
 *   endedAt: number
 * }} session
 */
export async function persistMeetingCostSession(session) {
  const user = await getCurrentUser();
  if (!user) return null;

  const calculatedCost = calculateMeetingCost(session.hourlyRate, session.durationSeconds);

  if (!supabase) return null;
  const { data, error } = await supabase.from('recordeasy_meeting_cost_sessions').insert({
    user_id: user.id,
    session_title: session.sessionTitle || 'Screen recording',
    hourly_rate: session.hourlyRate,
    duration_seconds: session.durationSeconds,
    calculated_cost: calculatedCost,
    started_at: new Date(session.startedAt).toISOString(),
    ended_at: new Date(session.endedAt).toISOString()
  }).select('id').single();

  if (error) {
    console.warn('Failed to save meeting cost session:', error.message);
    return null;
  }

  return data;
}
