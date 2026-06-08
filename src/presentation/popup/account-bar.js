import { getCurrentUser, restoreAuthSession, signOut } from '../../infrastructure/auth/auth-service.js';
import { fetchEntitlements } from '../../infrastructure/entitlements/entitlements-service.js';
import { initTheme } from '../shared/theme.js';
import { LOGIN_URL, PRICING_URL } from '../shared/urls.js';

/**
 * Renders account / plan bar at top of popup.
 */
export async function initAccountBar() {
  await initTheme();
  await restoreAuthSession();

  const bar = document.getElementById('accountBar');
  if (!bar) return;

  const user = await getCurrentUser();
  const entitlements = await fetchEntitlements();

  if (!user) {
    bar.innerHTML = `
      <div class="account-info">
        <span class="re-badge">Free · 30 min</span>
        <span class="account-email">Guest</span>
      </div>
      <div class="account-actions">
        <a class="re-btn re-btn-primary account-btn" href="${LOGIN_URL}" target="_blank" rel="noopener">Sign in</a>
        <a class="re-btn account-btn" href="${PRICING_URL}" target="_blank" rel="noopener">Plans</a>
      </div>
    `;
    return entitlements;
  }

  const badges = [`<span class="re-badge">${entitlements.planName}</span>`];
  if (entitlements.isEarlyUser) {
    badges.push('<span class="re-badge re-badge-early">Early user</span>');
  }
  badges.push(`<span class="re-badge">${entitlements.durationMinutes} min</span>`);

  bar.innerHTML = `
    <div class="account-info">
      ${badges.join('')}
      <span class="account-email">${escapeHtml(user.email)}</span>
    </div>
    <div class="account-actions">
      <a class="re-btn account-btn" href="${PRICING_URL}" target="_blank" rel="noopener">Upgrade</a>
      <button class="re-btn account-btn" id="signOutBtn" type="button">Sign out</button>
    </div>
  `;

  document.getElementById('signOutBtn')?.addEventListener('click', async () => {
    await signOut();
    window.location.reload();
  });

  return entitlements;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
