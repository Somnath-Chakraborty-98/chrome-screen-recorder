import { QUALITY_OPTIONS, capQuality } from '../../domain/recording/presets.js';
import { PRICING_URL, LOGIN_URL } from '../shared/urls.js';
import { canUseQuality } from '../../infrastructure/entitlements/entitlements-service.js';

/**
 * @param {import('../../infrastructure/entitlements/entitlements-service.js').Entitlements} entitlements
 */
export function renderRecordingOptions(entitlements) {
  renderDurationBadge(entitlements);
  renderQualitySelect(entitlements);
  renderMeetingCostSection(entitlements);
  renderSignInHint(entitlements);
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
function renderQualitySelect(entitlements) {
  const container = document.getElementById('qualityOptions');
  if (!container) return;

  const defaultQuality = entitlements.maxQuality;

  container.innerHTML = Object.values(QUALITY_OPTIONS)
    .map((q) => {
      const allowed = canUseQuality(q.id, entitlements);
      const checked = q.id === defaultQuality ? 'checked' : '';
      const lock = allowed
        ? ''
        : `<a class="option-lock" href="${entitlements.isLoggedIn ? PRICING_URL : LOGIN_URL}" target="_blank" title="Upgrade">🔒</a>`;

      return `
        <label class="quality-option ${allowed ? '' : 'locked'}">
          <input type="radio" name="recordQuality" value="${q.id}" ${allowed ? '' : 'disabled'} ${checked} />
          <span class="quality-option-text">
            <strong>${q.label}</strong>
            <span class="quality-option-hint">${q.hint}</span>
            ${lock}
          </span>
        </label>
      `;
    })
    .join('');
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
 * @returns {{ quality: 'low'|'medium'|'high', meetingCost: { enabled: boolean, hourlyRate: number } }}
 */
export function readRecordingOptions(entitlements) {
  const selected =
    document.querySelector('input[name="recordQuality"]:checked')?.value || entitlements.maxQuality;
  const quality = capQuality(
    /** @type {'low'|'medium'|'high'} */ (selected),
    entitlements.maxQuality
  );
  const meetingEnabled = Boolean(document.getElementById('meetingCostToggle')?.checked);
  const hourlyRate = Number(document.getElementById('hourlyRateInput')?.value || 0);

  return {
    quality,
    meetingCost: {
      enabled: meetingEnabled && entitlements.meetingCostEnabled,
      hourlyRate: meetingEnabled ? hourlyRate : 0
    }
  };
}
