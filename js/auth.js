/* =========================================================
   SafeHaven — Supabase Auth Module
   Handles registration, login, logout, session persistence
   and family-linking via invite codes.
   ========================================================= */

const SUPABASE_URL = window.__SAFEHAVEN_CONFIG__?.supabaseUrl || '';
const SUPABASE_ANON = window.__SAFEHAVEN_CONFIG__?.supabaseAnon || '';

// -------------------------------------------------------
// Lazy-load the Supabase JS SDK from CDN (keeps the app
// working as a plain static site with no bundler).
// -------------------------------------------------------
let _supabase = null;

async function getSupabase() {
  if (_supabase) return _supabase;
  if (!SUPABASE_URL || !SUPABASE_ANON) {
    throw new Error('Supabase is not configured. See SETUP.md.');
  }
  if (!window.supabase) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Supabase SDK.'));
      document.head.appendChild(s);
    });
  }
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
  return _supabase;
}

// -------------------------------------------------------
// Auth state callbacks
// -------------------------------------------------------
const _listeners = new Set();

export function onAuthChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function _notify(session) {
  _listeners.forEach(cb => cb(session));
}

// -------------------------------------------------------
// Bootstrap — wire up Supabase auth listener
// -------------------------------------------------------
let _bootstrapped = false;

export async function bootstrapAuth() {
  if (_bootstrapped) return;
  _bootstrapped = true;

  try {
    const sb = await getSupabase();
    // Notify immediately with current session
    const { data: { session } } = await sb.auth.getSession();
    _notify(session);

    // Listen for future changes (login, logout, token refresh)
    sb.auth.onAuthStateChange((_event, session) => {
      _notify(session);
    });
  } catch (err) {
    console.warn('[SafeHaven] Supabase not configured — running in demo mode.', err.message);
    _notify(null); // No session → demo mode
  }
}

// -------------------------------------------------------
// Registration
// -------------------------------------------------------
/**
 * Register a new user.
 * @param {string} email
 * @param {string} password
 * @param {string} name   — display name
 * @param {'parent'|'child'} role
 * @returns {{ user, error }}
 */
export async function register(email, password, name, role) {
  if (!['parent', 'child'].includes(role)) {
    return { user: null, error: { message: 'Role must be parent or child.' } };
  }
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { name, role } }
    });
    if (error) return { user: null, error };

    // Insert profile row (Supabase trigger can also do this,
    // but we do it explicitly for reliability)
    if (data.user) {
      await sb.from('profiles').upsert({
        id:   data.user.id,
        name,
        role
      });

      // If the user is a parent, also create their family automatically
      if (role === 'parent') {
        const { data: fam } = await sb.from('families').insert({
          name: `${name}'s Family`,
          owner_id: data.user.id
        }).select().single();
        if (fam) {
          // Store family_id in user metadata for convenience
          await sb.auth.updateUser({ data: { family_id: fam.id } });
        }
      }
    }

    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: { message: err.message } };
  }
}

// -------------------------------------------------------
// Login
// -------------------------------------------------------
export async function login(email, password) {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { session: null, error };
    return { session: data.session, error: null };
  } catch (err) {
    return { session: null, error: { message: err.message } };
  }
}

// -------------------------------------------------------
// Logout
// -------------------------------------------------------
export async function logout() {
  try {
    const sb = await getSupabase();
    await sb.auth.signOut();
  } catch (err) {
    console.error('[auth] logout error:', err.message);
  }
}

// -------------------------------------------------------
// Get the current user profile from DB
// -------------------------------------------------------
export async function getMyProfile() {
  try {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
    return data ? { ...data, email: user.email, supabaseUser: user } : null;
  } catch {
    return null;
  }
}

// -------------------------------------------------------
// Invite codes — parent generates, child redeems
// -------------------------------------------------------

/**
 * Parent: generate a 6-digit invite code valid for 24 h.
 * @returns {{ code: string, expiresAt: string, error }}
 */
export async function generateInviteCode() {
  try {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { code: null, error: { message: 'Not authenticated.' } };

    const profile = await getMyProfile();
    if (profile?.role !== 'parent') {
      return { code: null, error: { message: 'Only parents can generate invite codes.' } };
    }

    // Get family_id from user metadata
    const familyId = user.user_metadata?.family_id;
    if (!familyId) return { code: null, error: { message: 'No family found. Please re-register.' } };

    // Invalidate any existing unused codes for this parent
    await sb.from('invite_codes')
      .delete()
      .eq('parent_id', user.id)
      .is('used_by', null);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await sb.from('invite_codes').insert({
      code,
      parent_id: user.id,
      family_id: familyId,
      expires_at: expiresAt
    }).select().single();

    if (error) return { code: null, error };
    return { code: data.code, expiresAt: data.expires_at, error: null };
  } catch (err) {
    return { code: null, error: { message: err.message } };
  }
}

/**
 * Child: redeem an invite code to link with a parent.
 * @param {string} code  6-digit code
 * @returns {{ success: boolean, parentName: string, error }}
 */
export async function redeemInviteCode(code) {
  try {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return { success: false, error: { message: 'Not authenticated.' } };

    const profile = await getMyProfile();
    if (profile?.role !== 'child') {
      return { success: false, error: { message: 'Only children can redeem invite codes.' } };
    }

    // Look up the code
    const { data: invite, error: lookupErr } = await sb
      .from('invite_codes')
      .select('*, profiles!invite_codes_parent_id_fkey(name)')
      .eq('code', code.trim())
      .is('used_by', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (lookupErr || !invite) {
      return { success: false, error: { message: 'Invalid or expired invite code.' } };
    }

    // Mark code as used
    await sb.from('invite_codes')
      .update({ used_by: user.id, used_at: new Date().toISOString() })
      .eq('id', invite.id);

    // Create the family link
    const { error: linkErr } = await sb.from('family_members').insert({
      family_id: invite.family_id,
      parent_id: invite.parent_id,
      child_id:  user.id
    });

    if (linkErr) return { success: false, error: linkErr };

    // Store family_id in child's metadata too
    await sb.auth.updateUser({ data: { family_id: invite.family_id } });

    const parentName = invite.profiles?.name || 'your parent';
    return { success: true, parentName, error: null };
  } catch (err) {
    return { success: false, error: { message: err.message } };
  }
}

// -------------------------------------------------------
// Get linked children for the current parent
// -------------------------------------------------------
export async function getLinkedChildren() {
  try {
    const sb = await getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return [];

    const { data, error } = await sb
      .from('family_members')
      .select('child_id, profiles!family_members_child_id_fkey(id, name, avatar_url, phone)')
      .eq('parent_id', user.id);

    if (error) return [];
    return (data || []).map(row => row.profiles);
  } catch {
    return [];
  }
}

// -------------------------------------------------------
// Export the raw client for other modules
// -------------------------------------------------------
export { getSupabase };
