/* =========================================================
   SafeHaven Live - boot: session, profile and role routing
   Handles returns from Google (OAuth), email confirmation and
   password-reset links, then routes by the role stored in the
   database profile (never by anything in the URL or metadata).
   ========================================================= */

import { sb, esc, isLiveConfigured, friendlyError, initials, readPendingRole, clearPendingRole, providerLabel, copyText, flashDone } from './api.js';
import { renderAuth, renderPasswordReset } from './authView.js';
import { renderOnboarding } from './onboardingView.js';
import { ParentApp } from './parentApp.js';
import { ChildApp } from './childApp.js';
import { store } from '../state.js';
import { icon } from '../icons.js';
import { openModal, closeModal, showToast } from '../app.js';

let current = null;   // mounted ParentApp / ChildApp
let currentUserId = null;
let root = null;
let recovering = false; // signed in by a password-reset link: ask for a new password first

const AUTH_PARAMS = ['auth', 'code', 'error', 'error_code', 'error_description', 'state', 'token_hash', 'type'];

/* What Supabase put in the URL when sending the browser back here. Read before the client consumes it. */
function readAuthReturn() {
  const q = new URLSearchParams(window.location.search);
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const get = (k) => q.get(k) || h.get(k) || '';
  return {
    kind: q.get('auth') || '',                // callback (Google) | confirmed (sign-up email) | recovery (reset email)
    error: get('error'),
    errorCode: get('error_code'),
    errorDescription: get('error_description'),
    tokenHash: q.get('token_hash') || '',     // optional cross-device email links (see docs/AUTH_SETUP.md)
    otpType: q.get('type') || '',
    recoveryHash: h.get('type') === 'recovery'
  };
}

function cleanAuthUrl() {
  const url = new URL(window.location.href);
  let changed = Boolean(url.hash);
  for (const k of AUTH_PARAMS) {
    if (url.searchParams.has(k)) { url.searchParams.delete(k); changed = true; }
  }
  if (changed) window.history.replaceState(window.history.state, '', url.pathname + (url.search || ''));
}

function returnErrorMessage(ret) {
  const desc = (ret.errorDescription || '').replace(/\+/g, ' ');
  if (ret.errorCode === 'otp_expired') return friendlyError({ code: 'otp_expired', message: desc });
  if (ret.kind === 'callback' && ret.error === 'access_denied') {
    return 'Google sign-in was cancelled. Nothing was created or changed — you can try again.';
  }
  return friendlyError({ code: ret.errorCode, message: desc || ret.error });
}

function setChrome(profile, user) {
  const chip = document.getElementById('gmail-auth-btn');
  const nameEl = document.getElementById('header-gmail-email');
  const initEl = document.getElementById('header-gmail-initial');
  if (nameEl) nameEl.textContent = profile ? profile.display_name : 'Sign in';
  if (initEl) initEl.textContent = profile ? initials(profile.display_name).slice(0, 1) : '?';
  if (chip) {
    chip.classList.toggle('unauthenticated', !profile);
    chip.title = profile ? 'Your account' : 'Sign in';
    chip.onclick = () => (profile ? openAccountModal(profile, user) : null);
  }
  const roleTag = document.getElementById('live-role-tag');
  if (roleTag) {
    roleTag.hidden = !profile;
    roleTag.textContent = profile ? (profile.role === 'parent' ? 'Guardian' : 'Child device') : '';
  }
}

function pageLoading(text) {
  return `<div class="live-loading live-loading--page" role="status"><span class="live-loading__mark">${icon('shieldCheck', 24)}</span><span>${esc(text)}</span></div>`;
}

function setIndicator(state) {
  const el = document.getElementById('live-tracking-indicator');
  if (el) el.hidden = state !== 'active';
}

function openAccountModal(profile, user) {
  const idLabel = profile.role === 'parent' ? 'Parent ID' : 'Child ID';
  openModal(
    'Account',
    `
      <div class="account">
        <span class="account__avatar">${esc(initials(profile.display_name).slice(0, 1))}</span>
        <div class="account__body">
          <div class="account__name">${esc(profile.display_name)}</div>
          <div class="account__email">${esc(user && user.email)}</div>
          <div class="account__role">${profile.role === 'parent' ? 'Guardian account' : 'Child account'} · ${esc(providerLabel(user))}</div>
        </div>
        <span class="pill pill--safe pill--xs"><i class="dot"></i>Live</span>
      </div>
      ${profile.public_id ? `
        <div class="live-id-box">
          <div><div class="live-id-box__label">${idLabel}</div><div class="mono live-id-box__value">${esc(profile.public_id)}</div></div>
          <button class="btn btn--soft btn--sm" data-acct="copy">${icon('copy', 14)} Copy</button>
        </div>
        <p class="fine">Your public ID identifies this account. It can't be used to link accounts or see anyone's data — that always needs a one-time invite code.</p>
      ` : ''}
      <button class="btn btn--danger-soft btn--block" data-acct="signout">${icon('logOut', 16)} Sign out</button>
      <div class="divider"><span>or</span></div>
      <button class="btn btn--soft btn--block" data-acct="demo">${icon('play', 16)} Switch to demo mode</button>
    `,
    '',
    { size: 'sm' }
  );
  const o = document.getElementById('global-modal-overlay');
  const copyBtn = o.querySelector('[data-acct="copy"]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(profile.public_id);
      if (ok) flashDone(copyBtn, `${icon('check', 14)} Copied`);
      else showToast('Couldn\'t copy', 'Select the ID and copy it manually.', 'warning');
    });
  }
  o.querySelector('[data-acct="signout"]').addEventListener('click', async () => {
    closeModal();
    await sb().auth.signOut();
  });
  o.querySelector('[data-acct="demo"]').addEventListener('click', () => window.enterDemoMode());
}

function unmount() {
  if (current) current.destroy();
  current = null;
  currentUserId = null;
}

function showAuth(opts) {
  unmount();
  setChrome(null);
  root.className = 'live-root';
  renderAuth(root, opts);
}

function showError(message, retry) {
  root.className = 'live-root';
  root.innerHTML = `
    <div class="locked">
      <div class="locked__mark">${icon('alert', 26)}</div>
      <h1 class="display">Couldn't load your account</h1>
      <p class="lede">${esc(message)}</p>
      <div class="hero__actions"><button class="btn btn--primary" data-retry>Try again</button><button class="btn btn--soft" data-signout>Sign out</button></div>
    </div>
  `;
  root.querySelector('[data-retry]').addEventListener('click', retry);
  root.querySelector('[data-signout]').addEventListener('click', () => sb().auth.signOut());
}

function showRecovery(session) {
  unmount();
  setChrome(null);
  currentUserId = session.user.id;
  renderPasswordReset(root, {
    email: session.user.email,
    onDone: () => {
      recovering = false;
      currentUserId = null;
      showToast('Password updated', 'Use your new password next time you sign in.', 'safe');
      mountSession(session);
    },
    onCancel: () => {
      recovering = false;
      sb().auth.signOut();
    }
  });
}

function showOnboarding(session) {
  setChrome(null);
  document.body.dataset.mode = 'parent';
  renderOnboarding(root, {
    user: session.user,
    onDone: () => {
      currentUserId = null;
      mountSession(session, { welcome: true });
    },
    onCancel: () => sb().auth.signOut()
  });
}

/* Routes a signed-in user by their database profile: dashboard, onboarding or error. */
async function mountSession(session, { welcome = false, confirmed = false } = {}) {
  if (recovering) {
    if (currentUserId !== session.user.id) showRecovery(session);
    return;
  }
  if (currentUserId === session.user.id) return;
  unmount();
  setChrome(null);
  const uid = session.user.id;
  currentUserId = uid;
  root.className = 'live-root';
  root.innerHTML = pageLoading('Signing you in…');

  const { data: profile, error } = await sb().from('profiles').select('*').eq('id', uid).maybeSingle();
  if (currentUserId !== uid) return; // signed out or switched account while loading
  if (error) {
    currentUserId = null;
    showError(friendlyError(error), () => mountSession(session));
    return;
  }
  if (!profile) {
    // Signed in (e.g. first time with Google) but no SafeHaven account type yet: no dashboard access
    showOnboarding(session);
    return;
  }

  const pending = readPendingRole();
  clearPendingRole();
  setChrome(profile, session.user);
  document.body.dataset.mode = profile.role === 'parent' ? 'parent' : 'child';
  current = profile.role === 'parent'
    ? new ParentApp(root, profile, session)
    : new ChildApp(root, profile, { setIndicator, user: session.user });
  await current.mount();

  const kind = profile.role === 'parent' ? 'Guardian' : 'Child';
  if (pending && pending !== profile.role) {
    showToast('Signed in to your existing account', `This Google account already has a ${kind} account, so you're signed in to it. Account types can't be changed.`, 'info');
  } else if (welcome) {
    showToast('Account created', `Your ${kind} ID is ${profile.public_id}.`, 'safe');
  } else if (confirmed) {
    showToast('Email confirmed', 'Your SafeHaven account is active.', 'safe');
  }
}

export async function startLive() {
  document.body.dataset.app = 'live';
  document.documentElement.setAttribute('data-theme', store.get().theme === 'dark' ? 'dark' : 'light');
  const refreshTopbar = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) themeBtn.innerHTML = icon(dark ? 'sun' : 'moon', 18);
    const audioBtn = document.getElementById('audio-toggle-btn');
    if (audioBtn) audioBtn.innerHTML = icon(store.get().isAudioMuted ? 'volumeX' : 'volume', 18);
  };
  refreshTopbar();
  store.subscribe(refreshTopbar);

  document.getElementById('main-viewport').hidden = true;
  root = document.getElementById('live-root');
  root.hidden = false;

  if (!isLiveConfigured()) {
    showAuth();
    return;
  }

  const ret = readAuthReturn();
  recovering = ret.kind === 'recovery' || ret.recoveryHash;
  root.className = 'live-root';
  root.innerHTML = pageLoading(ret.kind ? 'Finishing sign-in…' : 'Loading…');

  const client = sb();
  // Waits for supabase-js to exchange any ?code= from Google / an email link for a session
  const init = await client.auth.initialize();
  let { data: { session } } = await client.auth.getSession();
  let linkError = init && init.error ? init.error : null;

  // Optional cross-device email links carry a token_hash instead of a PKCE code
  if (!session && !ret.error && ret.tokenHash && ['signup', 'email', 'recovery', 'invite', 'magiclink'].includes(ret.otpType)) {
    const { data, error } = await client.auth.verifyOtp({ token_hash: ret.tokenHash, type: ret.otpType });
    if (error) linkError = error;
    else session = data.session;
    if (ret.otpType === 'recovery') recovering = true;
  }
  cleanAuthUrl();

  if (ret.error) {
    clearPendingRole();
    if (session && !recovering) await mountSession(session);
    else {
      recovering = false;
      showAuth({ mode: 'signin', error: returnErrorMessage(ret), unconfirmed: ret.errorCode === 'otp_expired' && ret.kind === 'confirmed' });
    }
  } else if (session) {
    await mountSession(session, { confirmed: ret.kind === 'confirmed' });
  } else if (ret.kind === 'confirmed') {
    // Link opened in a different browser than the sign-up: the email is confirmed, but this browser has no session
    showAuth({ mode: 'signin', notice: 'Your email is confirmed. Sign in to continue.' });
  } else if (ret.kind === 'recovery') {
    recovering = false;
    showAuth({ mode: 'forgot', error: linkError ? `${friendlyError(linkError)} Reset links must be opened in the browser where you requested them — request a new one here.` : 'Open the reset link in the same browser where you requested it, or request a new one here.' });
  } else if (ret.kind === 'callback') {
    clearPendingRole();
    showAuth({ mode: 'signin', error: linkError ? friendlyError(linkError) : 'Google sign-in didn\'t finish in this browser. Please try again.' });
  } else {
    showAuth();
  }

  client.auth.onAuthStateChange((event, s) => {
    // Defer: supabase-js warns against awaiting other calls inside this callback
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY' && s) {
        recovering = true;
        showRecovery(s);
      } else if (s && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        mountSession(s);
      } else if (event === 'SIGNED_OUT') {
        recovering = false;
        showAuth();
      }
    }, 0);
  });
}
