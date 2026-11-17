/* =========================================================
   SafeHaven Live - Supabase client, config and shared helpers
   ========================================================= */

const cfg = window.SAFEHAVEN_CONFIG || {};

export const config = {
  supabaseUrl: cfg.supabaseUrl || '',
  supabaseAnonKey: cfg.supabaseAnonKey || '',
  vapidPublicKey: cfg.vapidPublicKey || '',
  mapTileUrl: cfg.mapTileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapTileAttribution: cfg.mapTileAttribution || '&copy; OpenStreetMap contributors'
};

export const isLiveConfigured = () => Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);

let client = null;
export function sb() {
  if (!client) {
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      // PKCE: OAuth, confirmation and reset links return a one-time ?code= (no tokens in the URL)
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'safehaven-auth' }
    });
  }
  return client;
}

/* Where Supabase sends the browser back after Google, email confirmation or a reset link.
   The ?auth= marker tells liveApp which flow is returning. Must be allowed in
   Supabase > Authentication > URL Configuration (see docs/AUTH_SETUP.md). */
export const authRedirect = (kind) => `${window.location.origin}/?auth=${kind}`;

/* Public auth settings of the Supabase project (which providers are enabled,
   whether email confirmation is required). Cached for the page's lifetime. */
let settingsPromise = null;
export function authSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseAnonKey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => ({
        known: Boolean(s),
        google: Boolean(s && s.external && s.external.google),
        email: !s || Boolean(s.external && s.external.email),
        confirmEmail: !s || !s.mailer_autoconfirm,
        signupDisabled: Boolean(s && s.disable_signup)
      }))
      .catch(() => ({ known: false, google: false, email: true, confirmEmail: true, signupDisabled: false }));
  }
  return settingsPromise;
}

/* The account type picked before leaving for Google. Only a hint for the
   onboarding screen: the user confirms it there, and the database
   (complete_onboarding) validates it and makes it permanent. */
const PENDING_ROLE_KEY = 'safehaven_pending_role';
const PENDING_ROLE_TTL_MS = 30 * 60 * 1000;

export function savePendingRole(role) {
  if (role !== 'parent' && role !== 'child') return;
  try { localStorage.setItem(PENDING_ROLE_KEY, JSON.stringify({ role, at: Date.now() })); } catch (e) { /* storage blocked */ }
}

export function readPendingRole() {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_ROLE_KEY) || 'null');
    if (v && (v.role === 'parent' || v.role === 'child') && Date.now() - v.at < PENDING_ROLE_TTL_MS) return v.role;
  } catch (e) { /* ignore */ }
  return null;
}

export function clearPendingRole() {
  try { localStorage.removeItem(PENDING_ROLE_KEY); } catch (e) { /* ignore */ }
}

/* Password rules for new passwords (sign-up and reset). Sign-in accepts whatever the account has. */
export function passwordProblem(pw) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be at most 72 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use at least one letter and one number.';
  return '';
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function providerLabel(user) {
  const providers = (user && user.app_metadata && user.app_metadata.providers) || [];
  const names = providers.map((p) => (p === 'google' ? 'Google' : p === 'email' ? 'Email & password' : p));
  return names.length ? names.join(' + ') : 'Email & password';
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

/* Location freshness thresholds shared by the parent and child views */
export const LIVE_MS = 2 * 60 * 1000;
export const STALE_MS = 10 * 60 * 1000;

export const esc = (str) => String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function ago(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function clock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function fullTime(ts) {
  return new Date(ts).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const MESSAGES = {
  not_linked: 'No guardian is linked to this account yet.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  too_many_attempts: 'Too many wrong codes. Wait 15 minutes and try again.',
  invalid_or_expired_code: "That code is wrong or has expired. Ask your guardian for a new one.",
  too_many_guardians: 'This account already has the maximum of 4 guardians.',
  not_authenticated: 'Your session has ended. Please sign in again.',
  forbidden: "You don't have permission to do that.",
  not_found_or_closed: 'This SOS has already been closed.',
  already_onboarded: 'This account is already set up.',
  invalid_role: 'Choose Parent / Guardian or Child.',
  immutable_identity: "An account's type and ID can't be changed.",
  'Invalid login credentials': 'Email or password is incorrect.',
  'Email not confirmed': 'Confirm your email first: open the link we sent you. You can resend it below.',
  'User already registered': 'An account with this email already exists. Sign in instead, or reset your password.',
  'Signups not allowed': 'New sign-ups are turned off for this SafeHaven server.',
  'Email rate limit exceeded': 'Too many emails were sent. Wait a few minutes and try again.',
  'New password should be different': 'Choose a password you haven\'t used for this account.',
  'Password should be': 'That password is too weak. Use at least 8 characters with letters and numbers.',
  'Unable to validate email address': 'Enter a valid email address.',
  'Database error saving new user': "The account couldn't be created on the server. If you used Google, the onboarding database migration may not be applied yet (see docs/AUTH_SETUP.md).",
  'Unsupported provider': 'Google sign-in is not enabled for this SafeHaven server yet (see docs/AUTH_SETUP.md).',
  'Email link is invalid or has expired': 'That email link is invalid or has expired. Request a new one.',
  'Failed to fetch': "Can't reach the server. Check your connection."
};

const CODES = {
  email_not_confirmed: MESSAGES['Email not confirmed'],
  user_already_exists: MESSAGES['User already registered'],
  email_exists: MESSAGES['User already registered'],
  weak_password: MESSAGES['Password should be'],
  same_password: MESSAGES['New password should be different'],
  over_email_send_rate_limit: MESSAGES['Email rate limit exceeded'],
  over_request_rate_limit: 'Too many attempts. Wait a moment and try again.',
  signup_disabled: MESSAGES['Signups not allowed'],
  otp_expired: MESSAGES['Email link is invalid or has expired'],
  provider_disabled: MESSAGES['Unsupported provider'],
  validation_failed: 'Check the details you entered and try again.',
  session_not_found: 'Your session has ended. Please sign in again.',
  refresh_token_not_found: 'Your session has ended. Please sign in again.',
  bad_code_verifier: 'Sign-in was started in a different browser or tab. Start again here.',
  flow_state_expired: 'Sign-in took too long. Please start again.',
  flow_state_not_found: 'Sign-in took too long or was started elsewhere. Please start again.'
};

export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  const raw = typeof err === 'string' ? err : (err.message || err.error_description || err.error || '');
  if (err && typeof err === 'object' && err.code && CODES[err.code]) return CODES[err.code];
  for (const [key, msg] of Object.entries(MESSAGES)) {
    if (raw === key || raw.startsWith(key)) return msg;
  }
  if (/^For security purposes, you can only request this after/i.test(raw)) return 'Please wait a minute before requesting another email.';
  if (/invalid_input:/.test(raw)) return raw.replace(/^.*invalid_input:\s*/, '').replace(/^\w/, (c) => c.toUpperCase()) + '.';
  if (/check constraint/i.test(raw)) return 'Some values are out of the allowed range.';
  if (/row-level security|permission denied/i.test(raw)) return "You don't have permission to do that.";
  if (/network|fetch/i.test(raw)) return "Can't reach the server. Check your connection.";
  return raw || 'Something went wrong.';
}

/* Calls an RPC and throws a readable error for both transport errors and {ok:false} results */
export async function call(fn, args) {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new Error(friendlyError(error));
  if (data && typeof data === 'object' && data.ok === false) {
    const e = new Error(friendlyError(data.error));
    e.code = data.error;
    throw e;
  }
  return data;
}

/* Authenticated call to this app's own server (for things that need server-held secrets) */
export async function serverPost(path, body) {
  const { data } = await sb().auth.getSession();
  const token = data && data.session ? data.session.access_token : '';
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError(json.error || `Server error ${res.status}`));
  return json;
}

/* Stable colour per person (same name → same colour on every screen and device) */
export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 6;
}

export function avatarHtml(name, size = 'md', tone = '') {
  return `<span class="avatar avatar--${size} live-avatar av-${avatarColor(name)} ${tone ? `ring-${tone}` : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
}

/* Briefly turns a button into a success state (e.g. "Copied") and then restores it */
export function flashDone(btn, html, ms = 1600) {
  if (!btn || btn.dataset.flashing) return;
  const prev = btn.innerHTML;
  btn.dataset.flashing = '1';
  btn.classList.add('is-done');
  btn.innerHTML = html;
  setTimeout(() => {
    btn.innerHTML = prev;
    btn.classList.remove('is-done');
    delete btn.dataset.flashing;
  }, ms);
}
