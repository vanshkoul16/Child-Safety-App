// Shared helpers for the Supabase integration tests.
// Reads SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY from the
// environment or .env, falling back to `supabase status` for a local stack.
const { execSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

function loadConfig() {
  try { process.loadEnvFile(path.join(__dirname, '..', '.env')); } catch (e) { /* optional */ }
  let { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    const out = execSync('npx supabase status -o env', { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const env = Object.fromEntries(out.split(/\r?\n/).filter(l => l.includes('=')).map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')];
    }));
    SUPABASE_URL = SUPABASE_URL || env.API_URL;
    SUPABASE_ANON_KEY = SUPABASE_ANON_KEY || env.ANON_KEY || env.PUBLISHABLE_KEY;
    SUPABASE_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.SECRET_KEY;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase is not configured: start it with `npx supabase start` or set SUPABASE_* env vars');
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceKey: SUPABASE_SERVICE_ROLE_KEY };
}

const cfg = loadConfig();
const clientOpts = { auth: { persistSession: false, autoRefreshToken: false } };

function anonClient() {
  return createClient(cfg.url, cfg.anonKey, clientOpts);
}

function serviceClient() {
  return createClient(cfg.url, cfg.serviceKey, clientOpts);
}

// Registers a fresh account and returns a client signed in as it
async function signUp(role, name) {
  const client = anonClient();
  const email = `${role}-${crypto.randomUUID().slice(0, 8)}@safehaven.test`;
  const password = `T3st-${crypto.randomUUID()}`;
  const { data, error } = await client.auth.signUp({
    email, password, options: { data: { role, display_name: name } }
  });
  if (error) throw error;
  if (!data.session) throw new Error('Sign-up returned no session (are email confirmations enabled?)');
  return { client, user: data.user, email, password, token: data.session.access_token };
}

// Pretend earlier fixes arrived long enough ago to clear the 5-second rate limit
async function ageLocations(childId, seconds = 10) {
  const svc = serviceClient();
  const { data } = await svc.from('location_updates').select('id, received_at').eq('child_id', childId);
  for (const row of data || []) {
    const t = new Date(new Date(row.received_at).getTime() - seconds * 1000).toISOString();
    await svc.from('location_updates').update({ received_at: t }).eq('id', row.id);
  }
}

// Move a point `metres` north of (lat, lng)
function north(lat, lng, metres) {
  return { lat: lat + metres / 111320, lng };
}

module.exports = { cfg, anonClient, serviceClient, signUp, ageLocations, north };
