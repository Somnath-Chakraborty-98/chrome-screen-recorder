import { restoreAuthSession, signIn, signUp, resetPassword } from '../../infrastructure/auth/auth-service.js';
import { supabase } from '../../infrastructure/supabase/client.js';
import { initTheme } from '../shared/theme.js';
import { PRICING_URL, POPUP_URL } from '../shared/urls.js';

const forms = document.querySelectorAll('.auth-form');
const messageEl = document.getElementById('message');
const earlyUserBanner = document.getElementById('earlyUserBanner');

initTheme();
restoreAuthSession();

document.getElementById('pricingLink').href = PRICING_URL;

document.getElementById('showSignup').addEventListener('click', () => showPanel('signup'));
document.getElementById('showForgot').addEventListener('click', () => showPanel('forgot'));
document.getElementById('backToSigninFromSignup').addEventListener('click', () => showPanel('signin'));
document.getElementById('backToSigninFromForgot').addEventListener('click', () => showPanel('signin'));

function showPanel(panel) {
  forms.forEach((form) => {
    const isActive = form.dataset.panel === panel;
    form.classList.toggle('hidden', !isActive);
    form.hidden = !isActive;
  });
  hideMessage();
}

document.getElementById('signinForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();

  const email = document.getElementById('signinEmail').value.trim().toLowerCase();
  const password = document.getElementById('signinPassword').value;

  try {
    setLoading(event.target, true);
    const { user } = await signIn({ email, password });
    await showEarlyUserMessage(email, user?.id);
    showMessage('Signed in successfully. You can close this tab and return to the recorder.', 'success');
    setTimeout(() => {
      window.location.href = POPUP_URL;
    }, 1200);
  } catch (error) {
    showMessage(error.message || 'Sign in failed.', 'error');
  } finally {
    setLoading(event.target, false);
  }
});

document.getElementById('signupForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();

  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const password = document.getElementById('signupPassword').value;

  try {
    setLoading(event.target, true);
    const { user, session } = await signUp({ email, password, name });

    if (!session) {
      showMessage(
        'Account created. Check your email to verify, then sign in.',
        'info'
      );
    } else {
      await showEarlyUserMessage(email, user?.id);
      showMessage('Account created and signed in.', 'success');
      setTimeout(() => {
        window.location.href = POPUP_URL;
      }, 1200);
    }
  } catch (error) {
    showMessage(error.message || 'Sign up failed.', 'error');
  } finally {
    setLoading(event.target, false);
  }
});

document.getElementById('forgotForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  hideMessage();

  const email = document.getElementById('forgotEmail').value.trim().toLowerCase();

  try {
    setLoading(event.target, true);
    await resetPassword(email);
    showMessage('Password reset email sent. Check your inbox.', 'success');
  } catch (error) {
    showMessage(error.message || 'Could not send reset email.', 'error');
  } finally {
    setLoading(event.target, false);
  }
});

async function showEarlyUserMessage(email, userId) {
  earlyUserBanner.classList.add('hidden');

  if (!supabase) return;
  const { data, error } = await supabase.rpc('check_recordeasy_early_user', {
    p_email: email
  });

  if (error || !data?.length) return;

  const isEarlyApplied = userId
    ? await supabase
        .from('recordeasy_users')
        .select('early_user')
        .eq('id', userId)
        .maybeSingle()
    : null;

  if (isEarlyApplied?.data?.early_user || data[0]?.is_early_user) {
    earlyUserBanner.textContent =
      '🎉 You are an early RecordEasy user! Watermark removed on Free — thank you for joining the waitlist.';
    earlyUserBanner.classList.remove('hidden');
  }
}

function showMessage(text, type) {
  messageEl.textContent = text;
  messageEl.className = `re-message re-message-${type}`;
  messageEl.classList.remove('hidden');
}

function hideMessage() {
  messageEl.classList.add('hidden');
}

function setLoading(form, isLoading) {
  const button = form.querySelector('.auth-submit');
  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = button.textContent;
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? 'Please wait…' : button.dataset.defaultLabel;
}
