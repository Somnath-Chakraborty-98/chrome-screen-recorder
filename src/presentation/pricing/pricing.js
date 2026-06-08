import { getCurrentUser } from '../../infrastructure/auth/auth-service.js';
import { fetchEntitlements, fetchPlans } from '../../infrastructure/entitlements/entitlements-service.js';
import { initTheme } from '../shared/theme.js';
import { LOGIN_URL } from '../shared/urls.js';

const plansGrid = document.getElementById('plansGrid');
const userSummary = document.getElementById('userSummary');

const STATIC_PLANS = [
  {
    code: 'free',
    name: 'Free',
    price_inr: 0,
    price_usd: 0,
    duration_minutes: 30,
    max_quality: 'low',
    mp4_enabled: true,
    watermark_enabled: false,
    custom_filename_enabled: false,
    meeting_cost_enabled: false
  },
  {
    code: 'plus',
    name: 'Plus',
    price_inr: 499,
    price_usd: 8,
    duration_minutes: 60,
    max_quality: 'medium',
    mp4_enabled: true,
    watermark_enabled: false,
    custom_filename_enabled: true,
    meeting_cost_enabled: true
  },
  {
    code: 'pro',
    name: 'Pro',
    price_inr: 999,
    price_usd: 18,
    duration_minutes: 120,
    max_quality: 'high',
    mp4_enabled: true,
    watermark_enabled: false,
    custom_filename_enabled: true,
    meeting_cost_enabled: true
  }
];

const FEATURE_LABELS = {
  duration_minutes: (v) => `${v} min recording`,
  max_quality: (v) => `MP4 · ${capitalize(v)} quality`,
  custom_filename_enabled: (v) => (v ? 'Custom file names' : 'Auto-generated file names'),
  meeting_cost_enabled: (v) => (v ? 'Meeting Cost Calculator' : 'No meeting cost calculator')
};

initTheme();
document.getElementById('loginLink').href = LOGIN_URL;

renderPlans(STATIC_PLANS, 'free');
init();

async function init() {
  try {
    const [user, entitlements, plans] = await Promise.all([
      getCurrentUser(),
      fetchEntitlements(),
      fetchPlans().catch(() => STATIC_PLANS)
    ]);

    if (user) {
      const badges = [entitlements.planName];
      if (entitlements.isEarlyUser) badges.push('Early user');
      userSummary.textContent = `Signed in as ${user.email} · ${badges.join(' · ')}`;
    } else {
      userSummary.textContent = 'Sign in to unlock Plus and Pro features.';
    }

    renderPlans(plans.length ? plans : STATIC_PLANS, entitlements.planCode);
  } catch (error) {
    userSummary.textContent = 'Showing default plans — sign in for your current plan.';
    console.warn('Plans init:', error);
  }
}

function renderPlans(plans, currentPlanCode) {
  plansGrid.innerHTML = '';

  plans.forEach((plan) => {
    const card = document.createElement('article');
    card.className = `re-card plan-card${plan.code === currentPlanCode ? ' current' : ''}`;

    const isCurrent = plan.code === currentPlanCode;
    const isFree = plan.code === 'free';

    card.innerHTML = `
      <h2>${escapeHtml(plan.name)}</h2>
      <div class="plan-price">
        ₹${Number(plan.price_inr).toLocaleString('en-IN')}
        <span> / $${Number(plan.price_usd).toFixed(0)} per month</span>
      </div>
      <ul class="plan-features">
        ${buildFeatureList(plan)
          .map((f) => `<li>${escapeHtml(f)}</li>`)
          .join('')}
      </ul>
      <button class="re-btn ${isFree ? '' : 're-btn-primary'} plan-cta ${isCurrent ? 'current-plan' : ''}" type="button" data-plan="${plan.code}">
        ${isCurrent ? 'Current plan' : isFree ? 'Included' : 'Upgrade — coming soon'}
      </button>
    `;

    const cta = card.querySelector('.plan-cta');
    if (!isCurrent && !isFree) {
      cta.addEventListener('click', () => {
        alert(
          'Checkout will open here once Vercel billing (Stripe + Razorpay) is connected.'
        );
      });
    }

    plansGrid.appendChild(card);
  });
}

function buildFeatureList(plan) {
  return [
    FEATURE_LABELS.duration_minutes(plan.duration_minutes),
    FEATURE_LABELS.max_quality(plan.max_quality),
    FEATURE_LABELS.custom_filename_enabled(plan.custom_filename_enabled),
    FEATURE_LABELS.meeting_cost_enabled(plan.meeting_cost_enabled)
  ];
}

function capitalize(value) {
  return String(value).charAt(0).toUpperCase() + String(value).slice(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
