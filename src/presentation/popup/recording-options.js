import { QUALITY_OPTIONS } from '../../domain/recording/presets.js';
import { PRICING_URL, LOGIN_URL } from '../shared/urls.js';

const SETUP_COLLAPSED_KEY = 'recordeasy_setup_collapsed';

/**
 * @param {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} entitlements
 */
export function renderRecordingOptions(entitlements) {
  renderFormatSelect(entitlements);
  renderDurationBadge(entitlements);
  renderMeetingCostSection(entitlements);
  renderSignInHint(entitlements);
}

/**
 * @param {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} entitlements
 */
function renderFormatSelect(entitlements) {
  const webmRadio = document.getElementById('formatWebm');
  const mp4Radio = document.getElementById('formatMp4');
  const mp4Lock = document.getElementById('mp4Lock');

  if (!webmRadio || !mp4Radio) return;

  webmRadio.checked = true;
  mp4Radio.checked = false;

  const mp4Label = document.getElementById('formatMp4Label');

  if (entitlements.mp4Enabled) {
    mp4Radio.disabled = false;
    mp4Label?.classList.remove('format-locked');
    if (mp4Lock) mp4Lock.classList.add('hidden');
  } else {
    mp4Radio.disabled = true;
    mp4Label?.classList.add('format-locked');
    if (mp4Lock) {
      mp4Lock.classList.remove('hidden');
      mp4Lock.href = entitlements.isLoggedIn ? PRICING_URL : LOGIN_URL;
    }
  }
}

/**
 * @param {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} entitlements
 */
function renderDurationBadge(entitlements) {
  const badge = document.getElementById('durationBadge');
  if (!badge) return;

  const limit = entitlements.durationMinutes;
  const plan = entitlements.planName;
  badge.textContent = `${plan}: ${limit} min max`;
  badge.title = `Your ${plan} plan allows up to ${limit} minutes per recording.`;
}

/**
 * @param {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} entitlements
 */
function renderMeetingCostSection(entitlements) {
  const section = document.getElementById('meetingCostSection');
  const toggle = document.getElementById('meetingCostToggle');
  const rateInput = document.getElementById('hourlyRateInput');
  const rateBlock = document.getElementById('hourlyRateBlock');
  const lock = document.getElementById('meetingCostLock');

  if (!section || !toggle || !rateInput) return;

  if (entitlements.meetingCostEnabled) {
    section.classList.remove('disabled');
    toggle.disabled = false;
    updateHourlyRateVisibility(toggle.checked, rateInput, rateBlock);
    if (lock) lock.classList.add('hidden');
  } else {
    section.classList.add('disabled');
    toggle.checked = false;
    toggle.disabled = true;
    rateInput.disabled = true;
    if (rateBlock) rateBlock.classList.add('hidden');
    if (lock) {
      lock.classList.remove('hidden');
      lock.href = entitlements.isLoggedIn ? PRICING_URL : LOGIN_URL;
    }
  }

  if (!toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('change', () => {
      updateHourlyRateVisibility(toggle.checked, rateInput, rateBlock);
    });
  }
}

/**
 * @param {boolean} visible
 * @param {HTMLInputElement} rateInput
 * @param {HTMLElement|null} rateBlock
 */
function updateHourlyRateVisibility(visible, rateInput, rateBlock) {
  if (rateBlock) {
    rateBlock.classList.toggle('hidden', !visible);
  }
  rateInput.disabled = !visible;
}

/**
 * @param {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} entitlements
 */
function renderSignInHint(entitlements) {
  const hint = document.getElementById('setupSignInHint');
  if (!hint) return;

  hint.classList.toggle('hidden', entitlements.isLoggedIn);
}

/**
 * Restore collapsible recording setup state from storage.
 */
export async function initRecordingSetupCollapse() {
  const toggle = document.getElementById('recordingSetupToggle');
  const body = document.getElementById('recordingSetupBody');
  if (!toggle || !body) return;

  const { [SETUP_COLLAPSED_KEY]: collapsed } = await chrome.storage.local.get(SETUP_COLLAPSED_KEY);
  setSetupCollapsed(Boolean(collapsed), toggle, body);

  toggle.addEventListener('click', async () => {
    const nextCollapsed = toggle.getAttribute('aria-expanded') === 'true';
    setSetupCollapsed(nextCollapsed, toggle, body);
    await chrome.storage.local.set({ [SETUP_COLLAPSED_KEY]: nextCollapsed });
  });
}

/**
 * @param {boolean} collapsed
 * @param {HTMLButtonElement} toggle
 * @param {HTMLElement} body
 */
function setSetupCollapsed(collapsed, toggle, body) {
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  body.classList.toggle('hidden', collapsed);
  toggle.querySelector('.collapse-icon').textContent = collapsed ? '▸' : '▾';
}

/**
 * @returns {{ format: 'webm'|'mp4', quality: 'low'|'medium'|'high', meetingCost: { enabled: boolean, hourlyRate: number } }}
 */
export function readRecordingOptions(entitlements) {
  const format =
    document.getElementById('formatMp4')?.checked && entitlements.mp4Enabled
      ? 'mp4'
      : 'webm';
  const quality = entitlements.maxQuality;
  const meetingEnabled = Boolean(document.getElementById('meetingCostToggle')?.checked);
  const hourlyRate = Number(document.getElementById('hourlyRateInput')?.value || 0);

  return {
    format,
    quality,
    meetingCost: {
      enabled: meetingEnabled && entitlements.meetingCostEnabled,
      hourlyRate: meetingEnabled ? hourlyRate : 0
    }
  };
}

/**
 * @param {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} entitlements
 */
export function getQualityLabelForPlan(entitlements) {
  return QUALITY_OPTIONS[entitlements.maxQuality]?.hint || '';
}
