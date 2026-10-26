// Integration tests for local-server.js + server/liveApi.js against a running Supabase
// stack: static-file allowlist, public config, and the SOS push path end to end through
// a mock Web Push service (we hold the subscription keys, so we can decrypt the payload
// exactly like a browser would and post the delivery receipt like the service worker does).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const ece = require('http_ece');
const { signUp, serviceClient, cfg } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const PORT = 3000 + Math.floor(Math.random() * 900) + 50;
const BASE = `http://127.0.0.1:${PORT}`;

let server;
let pushSrv;
let pushPort;
const pushes = [];

function rawGet(p) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

async function post(p, body, headers = {}) {
  const res = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

function subscriptionKeys() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return { ecdh, authSecret, p256dh: ecdh.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') };
}

before(async () => {
  // Mock push service over HTTPS with a throwaway self-signed certificate
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'safehaven-push-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
  pushSrv = https.createServer({ key: fs.readFileSync(path.join(dir, 'key.pem')), cert: fs.readFileSync(path.join(dir, 'cert.pem')) }, (req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      pushes.push({ path: req.url, headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(req.url.startsWith('/gone') ? 410 : 201);
      res.end();
    });
  });
  await new Promise((r) => pushSrv.listen(0, '127.0.0.1', r));
  pushPort = pushSrv.address().port;

  const vapid = require('web-push').generateVAPIDKeys();
  server = spawn(process.execPath, ['local-server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      SUPABASE_URL: cfg.url,
      SUPABASE_ANON_KEY: cfg.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: cfg.serviceKey,
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.com',
      NODE_TLS_REJECT_UNAUTHORIZED: '0' // only so the server trusts the mock push service's self-signed cert
    },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/live/status`);
      if (r.ok) return;
    } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  if (server) server.kill();
  if (pushSrv) pushSrv.close();
});

test('static server only serves public files', async () => {
  for (const p of ['/.env', '/.env.example', '/server/liveApi.js', '/supabase/config.toml', '/package.json', '/tests/helpers.js',
    '/local-server.js', '/node_modules/web-push/package.json', '/js/../.env', '/%2eenv', '/js/..%2f.env', '/.git/config']) {
    const r = await rawGet(p);
    assert.equal(r.status, 404, `${p} must not be served`);
    assert.ok(!r.body.includes('SERVICE_ROLE'), `${p} leaked env`);
  }
  assert.equal((await rawGet('/')).status, 200);
  assert.equal((await rawGet('/js/main.js')).status, 200);
  const sw = await rawGet('/sw.js');
  assert.equal(sw.status, 200);
  assert.equal(sw.headers['x-content-type-options'], 'nosniff');
});

test('app-config.js exposes only public values', async () => {
  const r = await rawGet('/app-config.js');
  assert.equal(r.status, 200);
  assert.ok(r.body.includes(cfg.anonKey));
  assert.ok(!r.body.includes(cfg.serviceKey), 'service role key must never reach the browser');
  assert.ok(!/privateKey|VAPID_PRIVATE/i.test(r.body));
  const status = await (await fetch(`${BASE}/api/live/status`)).json();
  assert.deepEqual(status, { supabase: true, server: true, push: true });
});

test('SOS push: authenticated, owner-only, idempotent, honest delivery status', async () => {
  const [p1, p2, kid, other] = await Promise.all([
    signUp('parent', 'Push Parent'), signUp('parent', 'No-Push Parent'), signUp('child', 'Kiran'), signUp('child', 'Other Kid')
  ]);
  for (const p of [p1, p2]) {
    const code = (await p.client.rpc('create_link_invite')).data[0].code;
    assert.equal((await kid.client.rpc('redeem_link_invite', { p_code: code })).data.ok, true);
  }

  const good = subscriptionKeys();
  const stale = subscriptionKeys();
  assert.ifError((await p1.client.rpc('save_push_subscription', {
    p_endpoint: `https://127.0.0.1:${pushPort}/sub-good`, p_p256dh: good.p256dh, p_auth: good.auth
  })).error);
  assert.ifError((await p1.client.rpc('save_push_subscription', {
    p_endpoint: `https://127.0.0.1:${pushPort}/gone-stale`, p_p256dh: stale.p256dh, p_auth: stale.auth
  })).error);

  await kid.client.rpc('submit_location', { p_lat: 32.7, p_lng: 74.86, p_accuracy: 15, p_recorded_at: new Date().toISOString() });
  const sos = (await kid.client.rpc('raise_sos', {})).data.sos;

  assert.equal((await post('/api/live/sos-notify', { sosId: sos.id })).status, 401, 'no token');
  assert.equal((await post('/api/live/sos-notify', { sosId: sos.id }, { Authorization: 'Bearer nope' })).status, 401, 'bad token');
  assert.equal((await post('/api/live/sos-notify', { sosId: sos.id }, { Authorization: `Bearer ${kid.token}`, Origin: 'https://evil.example' })).status, 403, 'cross-origin');
  assert.equal((await post('/api/live/sos-notify', { sosId: 'x' }, { Authorization: `Bearer ${kid.token}` })).status, 400, 'invalid id');
  assert.equal((await post('/api/live/sos-notify', { sosId: sos.id }, { Authorization: `Bearer ${other.token}` })).status, 404, "another child cannot trigger pushes for this SOS");
  assert.equal((await post('/api/live/sos-notify', { sosId: sos.id }, { Authorization: `Bearer ${p1.token}` })).status, 404, 'a parent cannot trigger it either');
  assert.equal(pushes.length, 0);

  const res = await post('/api/live/sos-notify', { sosId: sos.id }, { Authorization: `Bearer ${kid.token}` });
  assert.equal(res.status, 200);
  assert.deepEqual(res.json.summary, { devices: 2, sent: 1, delivered: 0, failed: 1, guardiansWithoutPush: 1 });

  assert.equal(pushes.length, 2);
  const delivered = pushes.find((p) => p.path === '/sub-good');
  assert.equal(delivered.headers['content-encoding'], 'aes128gcm');
  assert.equal(delivered.headers.urgency, 'high');
  assert.match(delivered.headers.authorization, /^vapid t=/);

  // Decrypt exactly as the browser would
  const payload = JSON.parse(ece.decrypt(delivered.body, { version: 'aes128gcm', privateKey: good.ecdh, authSecret: good.authSecret }).toString('utf8'));
  assert.equal(payload.type, 'sos');
  assert.equal(payload.sosId, sos.id);
  assert.match(payload.title, /Kiran/);
  assert.ok(payload.receiptToken && payload.notificationId);

  const again = await post('/api/live/sos-notify', { sosId: sos.id }, { Authorization: `Bearer ${kid.token}` });
  assert.equal(again.json.alreadyNotified, true);
  assert.equal(pushes.length, 2, 'retries never re-send');

  const goneLeft = await serviceClient().from('push_subscriptions').select('id').eq('endpoint', `https://127.0.0.1:${pushPort}/gone-stale`);
  assert.equal(goneLeft.data.length, 0, 'expired subscriptions are removed');

  // Status is only "delivered" after the device posts a valid receipt
  let mine = (await p1.client.from('sos_notifications').select('status').eq('sos_id', sos.id)).data.map((r) => r.status).sort();
  assert.deepEqual(mine, ['failed', 'sent']);
  assert.equal((await post('/api/live/push-receipt', { notificationId: payload.notificationId, receiptToken: 'wrong' })).json.confirmed, false);
  assert.equal((await post('/api/live/push-receipt', { notificationId: payload.notificationId, receiptToken: payload.receiptToken })).json.confirmed, true);
  assert.equal((await post('/api/live/push-receipt', { notificationId: payload.notificationId, receiptToken: payload.receiptToken })).json.confirmed, false, 'receipts cannot be replayed');
  mine = (await p1.client.from('sos_notifications').select('status, delivered_at').eq('sos_id', sos.id).eq('status', 'delivered')).data;
  assert.equal(mine.length, 1);
  assert.ok(mine[0].delivered_at);

  const p2rows = (await p2.client.from('sos_notifications').select('status').eq('sos_id', sos.id)).data;
  assert.deepEqual(p2rows.map((r) => r.status), ['no_subscription'], 'second guardian is told honestly that no push reached them');
  const kidRows = (await kid.client.from('sos_notifications').select('status').eq('sos_id', sos.id)).data;
  assert.equal(kidRows.length, 3, 'the child can see delivery status for their SOS');
  const strangerRows = (await other.client.from('sos_notifications').select('status').eq('sos_id', sos.id)).data;
  assert.equal(strangerRows.length, 0);

  const otherSubs = (await p2.client.from('push_subscriptions').select('*')).data;
  assert.equal(otherSubs.length, 0, 'guardians cannot read each other\'s push subscriptions');
});

test('SOS notify is rate limited per user', async () => {
  const kid = await signUp('child', 'Spammer');
  let last;
  for (let i = 0; i < 11; i++) last = await post('/api/live/sos-notify', { sosId: crypto.randomUUID() }, { Authorization: `Bearer ${kid.token}` });
  assert.equal(last.status, 429);
});
