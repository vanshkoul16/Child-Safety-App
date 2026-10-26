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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'safehaven-auth' }
    });
  }
  return client;
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
  'Invalid login credentials': 'Email or password is incorrect.',
  'User already registered': 'An account with this email already exists. Sign in instead.',
  'Failed to fetch': "Can't reach the server. Check your connection."
};

export function friendlyError(err) {
  if (!err) return 'Something went wrong.';
  const raw = typeof err === 'string' ? err : (err.message || err.error_description || err.error || '');
  for (const [key, msg] of Object.entries(MESSAGES)) {
    if (raw === key || raw.startsWith(key)) return msg;
  }
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

export function avatarHtml(name, size = 'md', tone = '') {
  return `<span class="avatar avatar--${size} live-avatar ${tone ? `ring-${tone}` : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
}
