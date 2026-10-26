/**
 * SafeHaven — /api/location
 *
 * POST  — Child pushes a GPS fix (authenticated via Supabase JWT)
 * GET   — Parent fetches latest location for a child
 *
 * This endpoint acts as a Supabase proxy that validates the JWT
 * and enforces family membership before reading/writing location data.
 *
 * Environment variables required (Vercel / Render settings):
 *   SUPABASE_URL              — your project URL
 *   SUPABASE_SERVICE_ROLE_KEY — server-only service role key
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        opts.prefer || 'return=representation',
      ...(opts.headers || {})
    }
  });
  return res;
}

/**
 * Verify the caller's Supabase JWT and return the user object,
 * or null if the token is missing / invalid.
 */
async function verifyJWT(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${token}`
    }
  });
  if (!res.ok) return null;
  return await res.json();
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(503).json({ error: 'Supabase is not configured on the server.' });
  }

  // -------------------------------------------------------
  // POST /api/location — child pushes GPS fix
  // -------------------------------------------------------
  if (req.method === 'POST') {
    const user = await verifyJWT(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Unauthorized. Provide a valid Supabase JWT.' });

    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const { lat, lng, accuracy, speed, heading, altitude, is_demo } = body;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng are required numbers.' });
    }

    const payload = {
      child_id:    user.id,
      lat,
      lng,
      accuracy:    accuracy ?? null,
      speed:       speed    ?? null,
      heading:     heading  ?? null,
      altitude:    altitude ?? null,
      is_demo:     is_demo  ?? false,
      recorded_at: new Date().toISOString()
    };

    const sbRes = await sbFetch('/location_updates', {
      method: 'POST',
      prefer: 'return=minimal',
      body: JSON.stringify(payload)
    });

    if (!sbRes.ok) {
      const err = await sbRes.text();
      console.error('[api/location POST] Supabase error:', err);
      return res.status(500).json({ error: 'Failed to store location.' });
    }

    return res.status(200).json({ success: true, recordedAt: payload.recorded_at });
  }

  // -------------------------------------------------------
  // GET /api/location?childId=<uuid> — parent reads latest fix
  // -------------------------------------------------------
  if (req.method === 'GET') {
    const user = await verifyJWT(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Unauthorized.' });

    const childId = (req.query?.childId || new URL(req.url, 'http://x').searchParams.get('childId') || '').trim();
    if (!childId) return res.status(400).json({ error: 'childId query param is required.' });

    // Verify the requester is a parent of this child
    const linkRes = await sbFetch(
      `/family_members?parent_id=eq.${user.id}&child_id=eq.${childId}&select=id`
    );
    const links = await linkRes.json();
    if (!Array.isArray(links) || links.length === 0) {
      return res.status(403).json({ error: 'You are not authorized to view this child\'s location.' });
    }

    const locRes = await sbFetch(
      `/location_updates?child_id=eq.${childId}&order=recorded_at.desc&limit=1&select=lat,lng,accuracy,speed,heading,altitude,is_demo,recorded_at`
    );
    const rows = await locRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(200).json({ location: null });
    }

    return res.status(200).json({ location: rows[0] });
  }

  res.status(405).json({ error: 'Method not allowed.' });
};
