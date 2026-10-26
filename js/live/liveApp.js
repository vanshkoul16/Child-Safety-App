/* =========================================================
   SafeHaven Live - boot: session, profile and role routing
   ========================================================= */

import { sb, esc, isLiveConfigured, friendlyError, initials } from './api.js';
import { renderAuth } from './authView.js';
import { ParentApp } from './parentApp.js';
import { ChildApp } from './childApp.js';
import { store } from '../state.js';
import { icon } from '../icons.js';
import { openModal, closeModal } from '../app.js';

let current = null;   // mounted ParentApp / ChildApp
let currentUserId = null;
let root = null;

function setChrome(profile, email) {
  const chip = document.getElementById('gmail-auth-btn');
  const nameEl = document.getElementById('header-gmail-email');
  const initEl = document.getElementById('header-gmail-initial');
  if (nameEl) nameEl.textContent = profile ? profile.display_name : 'Sign in';
  if (initEl) initEl.textContent = profile ? initials(profile.display_name).slice(0, 1) : '?';
  if (chip) {
    chip.classList.toggle('unauthenticated', !profile);
    chip.onclick = () => (profile ? openAccountModal(profile, email) : null);
  }
  const roleTag = document.getElementById('live-role-tag');
  if (roleTag) {
    roleTag.hidden = !profile;
    roleTag.textContent = profile ? (profile.role === 'parent' ? 'Guardian' : 'Child device') : '';
  }
}

function setIndicator(state) {
  const el = document.getElementById('live-tracking-indicator');
  if (el) el.hidden = state !== 'active';
}

function openAccountModal(profile, email) {
  openModal(
    'Account',
    `
      <div class="account">
        <span class="account__avatar">${esc(initials(profile.display_name).slice(0, 1))}</span>
        <div class="account__body">
          <div class="account__name">${esc(profile.display_name)}</div>
          <div class="account__email">${esc(email)}</div>
          <div class="account__role">${profile.role === 'parent' ? 'Guardian account' : 'Child account'}</div>
        </div>
        <span class="pill pill--safe pill--xs"><i class="dot"></i>Live</span>
      </div>
      <button class="btn btn--danger-soft btn--block" data-acct="signout">${icon('logOut', 16)} Sign out</button>
      <div class="divider"><span>or</span></div>
      <button class="btn btn--soft btn--block" data-acct="demo">${icon('play', 16)} Switch to demo mode</button>
    `,
    '',
    { size: 'sm' }
  );
  const o = document.getElementById('global-modal-overlay');
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

async function mountSession(session) {
  if (currentUserId === session.user.id) return;
  unmount();
  setChrome(null);
  currentUserId = session.user.id;
  root.className = 'live-root';
  root.innerHTML = `<div class="live-loading live-loading--page">${icon('shieldCheck', 22)}<span>Signing you in…</span></div>`;

  const { data: profile, error } = await sb().from('profiles').select('*').eq('id', session.user.id).maybeSingle();
  if (error || !profile) {
    currentUserId = null;
    showError(error ? friendlyError(error) : 'This account has no SafeHaven profile.', () => mountSession(session));
    return;
  }
  setChrome(profile, session.user.email);
  document.body.dataset.mode = profile.role === 'parent' ? 'parent' : 'child';
  current = profile.role === 'parent'
    ? new ParentApp(root, profile, session)
    : new ChildApp(root, profile, { setIndicator });
  await current.mount();
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

  const client = sb();
  client.auth.onAuthStateChange((event, session) => {
    // Defer: supabase-js warns against awaiting other calls inside this callback
    setTimeout(() => {
      if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) mountSession(session);
      else if (event === 'SIGNED_OUT') showAuth();
    }, 0);
  });
  const { data } = await client.auth.getSession();
  if (!data.session) showAuth();
}
