// SafeHaven live-mode server routes.
//   GET  /app-config.js          public client config (Supabase URL + anon key, VAPID public key, tiles)
//   GET  /api/live/status        which live features are configured
//   POST /api/live/sos-notify    push an SOS to every linked guardian device (child's JWT required)
//   POST /api/live/push-receipt  service worker confirms a push reached the guardian's device
// The service-role key and VAPID private key never leave this process.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');

const env = process.env;
const SUPABASE_URL = env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || '';
const VAPID_PUBLIC_KEY = env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = env.VAPID_SUBJECT || '';

const supabaseReady = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const serverReady = supabaseReady && Boolean(SUPABASE_SERVICE_ROLE_KEY);
const pushReady = serverReady && Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);

if (pushReady) webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = serverReady
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const SOS_NOTIFY_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 4096;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Fixed-window rate limiter, in memory (one process). Use a shared store if you scale out. */
const buckets = new Map();
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    buckets.set(key, { start: now, count: 1 });
    return false;
  }
  b.count += 1;
  return b.count > limit;
}
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [k, b] of buckets) if (b.start < cutoff) buckets.delete(k);
}, 10 * 60 * 1000).unref();

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload_too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (e) {
        reject(Object.assign(new Error('invalid_json'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function clientIp(req) {
  return req.socket.remoteAddress || 'unknown';
}

// Only same-origin browser requests may call the authenticated endpoints
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

function appConfigScript() {
  const cfg = {
    supabaseUrl: supabaseReady ? SUPABASE_URL : '',
    supabaseAnonKey: supabaseReady ? SUPABASE_ANON_KEY : '',
    vapidPublicKey: pushReady ? VAPID_PUBLIC_KEY : '',
    mapTileUrl: env.MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    mapTileAttribution: env.MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  };
  return `window.SAFEHAVEN_CONFIG = Object.freeze(${JSON.stringify(cfg)});\n`;
}

async function userFromRequest(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || token.length > 4096) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user;
}

async function notifySos(req, res) {
  if (!serverReady) return send(res, 503, { error: 'live_not_configured' });
  if (!sameOrigin(req)) return send(res, 403, { error: 'forbidden_origin' });
  if (rateLimited(`sos-ip:${clientIp(req)}`, 30, 60 * 60 * 1000)) return send(res, 429, { error: 'rate_limited' });

  const user = await userFromRequest(req);
  if (!user) return send(res, 401, { error: 'not_authenticated' });
  if (rateLimited(`sos-user:${user.id}`, 10, 60 * 60 * 1000)) return send(res, 429, { error: 'rate_limited' });

  const body = await readJson(req);
  const sosId = String(body.sosId || '');
  if (!UUID_RE.test(sosId)) return send(res, 400, { error: 'invalid_sos_id' });

  const { data: sos, error: sosErr } = await admin.from('sos_alerts').select('*').eq('id', sosId).maybeSingle();
  if (sosErr) throw sosErr;
  // Same response for "missing" and "not yours" so ids cannot be probed
  if (!sos || sos.child_id !== user.id) return send(res, 404, { error: 'not_found' });
  if (!['active', 'acknowledged'].includes(sos.status)) return send(res, 409, { error: 'sos_closed' });
  if (Date.now() - new Date(sos.created_at).getTime() > SOS_NOTIFY_WINDOW_MS) return send(res, 409, { error: 'sos_too_old' });

  // Idempotent: a retry from the child's phone never sends duplicate pushes
  const { data: existing } = await admin.from('sos_notifications').select('status').eq('sos_id', sosId);
  if (existing && existing.length) return send(res, 200, { alreadyNotified: true, summary: summarize(existing) });

  if (!pushReady) {
    return send(res, 200, { pushConfigured: false, summary: summarize([]) });
  }

  const [{ data: child }, { data: links }] = await Promise.all([
    admin.from('profiles').select('display_name').eq('id', user.id).single(),
    admin.from('family_links').select('parent_id').eq('child_id', user.id)
  ]);
  const parentIds = (links || []).map((l) => l.parent_id);
  const { data: subs } = parentIds.length
    ? await admin.from('push_subscriptions').select('*').in('user_id', parentIds)
    : { data: [] };

  const rows = [];
  const targets = [];
  for (const parentId of parentIds) {
    const mine = (subs || []).filter((s) => s.user_id === parentId);
    // Every row carries the same keys: PostgREST bulk inserts require it
    if (!mine.length) {
      rows.push({
        id: crypto.randomUUID(), sos_id: sosId, parent_id: parentId, subscription_id: null, status: 'no_subscription',
        receipt_token_hash: null, detail: 'Guardian has not enabled push notifications on any device'
      });
      continue;
    }
    for (const sub of mine) {
      const id = crypto.randomUUID();
      const receiptToken = crypto.randomBytes(24).toString('base64url');
      rows.push({ id, sos_id: sosId, parent_id: parentId, subscription_id: sub.id, status: 'queued', receipt_token_hash: sha256(receiptToken), detail: null });
      targets.push({ id, sub, receiptToken });
    }
  }
  // Rows go in before any push is sent so a fast receipt always finds its row
  if (rows.length) {
    const { error } = await admin.from('sos_notifications').insert(rows);
    if (error) throw error;
  }

  const title = `SOS from ${child ? child.display_name : 'your child'}`;
  const pushBody = sos.lat != null
    ? `Tap to see their last known location (±${Math.round(sos.accuracy_m)} m).`
    : 'No location was available. Call them now.';
  await Promise.all(targets.map(async ({ id, sub, receiptToken }) => {
    const payload = JSON.stringify({ type: 'sos', sosId, notificationId: id, receiptToken, title, body: pushBody, url: `/?sos=${sosId}` });
    let patch;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, { TTL: 600, urgency: 'high' });
      patch = { status: 'sent', sent_at: new Date().toISOString(), detail: 'Accepted by the push service' };
      await admin.from('push_subscriptions').update({ last_success_at: patch.sent_at }).eq('id', sub.id);
    } catch (err) {
      patch = { status: 'failed', detail: `Push service error ${err.statusCode || err.code || ''}`.trim() };
      if (err.statusCode === 404 || err.statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', sub.id);
        patch.detail = 'Subscription expired; guardian must re-enable notifications';
      }
    }
    // Never downgrade a row the device receipt already marked delivered
    await admin.from('sos_notifications').update(patch).eq('id', id).neq('status', 'delivered');
  }));
  const { data: final } = await admin.from('sos_notifications').select('status').eq('sos_id', sosId);
  return send(res, 200, { pushConfigured: true, summary: summarize(final || []) });
}

function summarize(rows) {
  const s = { devices: 0, sent: 0, delivered: 0, failed: 0, guardiansWithoutPush: 0 };
  for (const r of rows) {
    if (r.status === 'no_subscription') { s.guardiansWithoutPush += 1; continue; }
    s.devices += 1;
    if (r.status === 'sent') s.sent += 1;
    if (r.status === 'delivered') s.delivered += 1;
    if (r.status === 'failed') s.failed += 1;
  }
  return s;
}

async function pushReceipt(req, res) {
  if (!serverReady) return send(res, 503, { error: 'live_not_configured' });
  if (rateLimited(`receipt-ip:${clientIp(req)}`, 120, 60 * 60 * 1000)) return send(res, 429, { error: 'rate_limited' });
  const body = await readJson(req);
  const id = String(body.notificationId || '');
  const token = String(body.receiptToken || '');
  if (!UUID_RE.test(id) || !token || token.length > 100) return send(res, 400, { error: 'invalid_receipt' });

  const { data, error } = await admin.from('sos_notifications')
    .update({ status: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', id).eq('receipt_token_hash', sha256(token)).is('delivered_at', null)
    .select('id');
  if (error) throw error;
  return send(res, 200, { confirmed: Boolean(data && data.length) });
}

async function purge() {
  if (!admin) return;
  const { data, error } = await admin.rpc('purge_expired_data');
  if (error) console.warn('[SafeHaven] retention purge failed:', error.message);
  else if (data && (data.locations || data.invites)) console.log('[SafeHaven] retention purge:', data);
}

function startMaintenance() {
  if (!admin) return;
  purge();
  setInterval(purge, 60 * 60 * 1000).unref();
}

// Returns true when the request was handled here
async function handle(req, res) {
  const pathname = req.url.split('?')[0];
  try {
    if (pathname === '/app-config.js' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(appConfigScript());
      return true;
    }
    if (pathname === '/api/live/status' && req.method === 'GET') {
      send(res, 200, { supabase: supabaseReady, server: serverReady, push: pushReady });
      return true;
    }
    if (pathname === '/api/live/sos-notify' && req.method === 'POST') {
      await notifySos(req, res);
      return true;
    }
    if (pathname === '/api/live/push-receipt' && req.method === 'POST') {
      await pushReceipt(req, res);
      return true;
    }
    if (pathname.startsWith('/api/live/')) {
      send(res, 404, { error: 'not_found' });
      return true;
    }
  } catch (err) {
    if (!res.headersSent) send(res, err.status || 500, { error: err.status ? err.message : 'server_error' });
    if (!err.status) console.error('[SafeHaven] live API error:', err);
    return true;
  }
  return false;
}

module.exports = { handle, startMaintenance, status: { supabaseReady, serverReady, pushReady } };
