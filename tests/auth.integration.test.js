// Integration tests for account onboarding (Google / OAuth path), permanent roles,
// public Parent / Child IDs and pending family invitations.
// Requires a running Supabase stack (`npm run db:start`) with all migrations applied.
//
// A Google sign-up creates an auth user without a SafeHaven profile. Real Google
// sign-ins can't run in CI, so "pending" accounts are made here by creating a normal
// account and removing its profile with the service role: from the database's point
// of view that is exactly the state a first-time Google user is in. The trigger's
// OAuth branch itself is covered by supabase/tests/oauth_onboarding.test.sql.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { anonClient, serviceClient, signUp } = require('./helpers');

const PARENT_ID = /^P-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const CHILD_ID = /^C-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

let parent, child, stranger;

async function pendingAccount(label) {
  const acct = await signUp('parent', label);
  const { error } = await serviceClient().from('profiles').delete().eq('id', acct.user.id);
  assert.ifError(error);
  return acct;
}

before(async () => {
  [parent, child, stranger] = await Promise.all([
    signUp('parent', 'Guardian G'),
    signUp('child', 'Kid K'),
    signUp('parent', 'Stranger S')
  ]);
});

test('every new profile gets a public ID that matches its role', async () => {
  const p = await parent.client.from('profiles').select('role, public_id').eq('id', parent.user.id).single();
  const c = await child.client.from('profiles').select('role, public_id').eq('id', child.user.id).single();
  assert.equal(p.data.role, 'parent');
  assert.match(p.data.public_id, PARENT_ID);
  assert.equal(c.data.role, 'child');
  assert.match(c.data.public_id, CHILD_ID);
  assert.notEqual(p.data.public_id, parent.user.id, 'public ID is separate from the internal UUID');
});

test('role and public ID are permanent, even for the service role', async () => {
  const byUser = await parent.client.from('profiles').update({ public_id: 'P-AAAA-AAAA' }).eq('id', parent.user.id);
  assert.ok(byUser.error, 'clients cannot change their public ID');
  const roleByUser = await parent.client.from('profiles').update({ role: 'child' }).eq('id', parent.user.id);
  assert.ok(roleByUser.error, 'clients cannot change their role');

  const bySvc = await serviceClient().from('profiles').update({ role: 'child' }).eq('id', parent.user.id);
  assert.ok(bySvc.error, 'the database refuses role changes from any caller');
  assert.match(bySvc.error.message, /immutable_identity/);

  const rename = await parent.client.from('profiles').update({ display_name: 'Guardian G2' }).eq('id', parent.user.id).select('display_name, role').single();
  assert.ifError(rename.error);
  assert.deepEqual(rename.data, { display_name: 'Guardian G2', role: 'parent' }, 'display name stays editable');
});

test('a public ID cannot be used to look up or link another account', async () => {
  const { data: kid } = await child.client.from('profiles').select('public_id').eq('id', child.user.id).single();
  const lookup = await stranger.client.from('profiles').select('*').eq('public_id', kid.public_id);
  assert.equal(lookup.data.length, 0, 'unrelated users cannot find a profile by its ID');

  const { data: par } = await parent.client.from('profiles').select('public_id').eq('id', parent.user.id).single();
  const link = await child.client.rpc('redeem_link_invite', { p_code: par.public_id });
  assert.deepEqual(link.data, { ok: false, error: 'invalid_or_expired_code' }, 'a Parent ID is not an invite code');
  const { data: links } = await child.client.from('family_links').select('*');
  assert.equal(links.length, 0);
});

test('an account without a profile (new Google user) has no access until onboarding', async () => {
  const pending = await pendingAccount('Pending P');
  const profiles = await pending.client.from('profiles').select('*');
  assert.equal(profiles.data.length, 0);
  assert.ok((await pending.client.rpc('create_link_invite')).error, 'cannot act as a parent');
  assert.ok((await pending.client.rpc('redeem_link_invite', { p_code: 'AAAA-AAAA' })).error, 'cannot act as a child');
  assert.ok((await pending.client.rpc('raise_sos', {})).error, 'cannot raise SOS');
  const zones = await pending.client.from('safe_zones').select('*');
  assert.equal(zones.data.length, 0);
});

test('onboarding validates input, assigns the role once and never changes it', async () => {
  const pending = await pendingAccount('Pending Q');
  const rpc = (args) => pending.client.rpc('complete_onboarding', args);

  assert.deepEqual((await rpc({ p_role: 'admin', p_display_name: 'Q' })).data, { ok: false, error: 'invalid_role' });
  assert.ok((await rpc({ p_role: 'child', p_display_name: '   ' })).error, 'blank names are rejected');
  assert.ok((await rpc({ p_role: 'child', p_display_name: 'x'.repeat(61) })).error, 'long names are rejected');

  const done = await rpc({ p_role: 'child', p_display_name: '  Quinn  ' });
  assert.ifError(done.error);
  assert.equal(done.data.ok, true);
  assert.equal(done.data.role, 'child');
  assert.match(done.data.public_id, CHILD_ID);

  const again = await rpc({ p_role: 'parent', p_display_name: 'Quinn' });
  assert.deepEqual(again.data, { ok: false, error: 'already_onboarded', role: 'child', public_id: done.data.public_id });

  const { data: profile } = await pending.client.from('profiles').select('role, display_name, public_id').eq('id', pending.user.id).single();
  assert.deepEqual(profile, { role: 'child', display_name: 'Quinn', public_id: done.data.public_id });

  // The new child can now use child features and link with an invite code
  const { data: inv } = await stranger.client.rpc('create_link_invite');
  const linked = await pending.client.rpc('redeem_link_invite', { p_code: inv[0].code });
  assert.equal(linked.data.ok, true);
});

test('parallel onboarding calls create exactly one profile', async () => {
  const pending = await pendingAccount('Pending R');
  const results = await Promise.all([
    pending.client.rpc('complete_onboarding', { p_role: 'parent', p_display_name: 'R' }),
    pending.client.rpc('complete_onboarding', { p_role: 'child', p_display_name: 'R' }),
    pending.client.rpc('complete_onboarding', { p_role: 'parent', p_display_name: 'R' })
  ]);
  const ok = results.filter((r) => r.data && r.data.ok === true);
  assert.equal(ok.length, 1, 'only one call wins');
  const { count } = await serviceClient().from('profiles').select('id', { count: 'exact', head: true }).eq('id', pending.user.id);
  assert.equal(count, 1);
});

test('signed-out callers cannot onboard and existing accounts never re-register', async () => {
  const anon = await anonClient().rpc('complete_onboarding', { p_role: 'parent', p_display_name: 'X' });
  assert.ok(anon.error, 'anon cannot call onboarding');

  const existing = await parent.client.rpc('complete_onboarding', { p_role: 'child', p_display_name: 'X' });
  assert.equal(existing.data.ok, false);
  assert.equal(existing.data.error, 'already_onboarded');
  assert.equal(existing.data.role, 'parent');
});

test('signing in again restores the same account, role and ID', async () => {
  const { data: before } = await parent.client.from('profiles').select('role, public_id').eq('id', parent.user.id).single();
  const fresh = anonClient();
  const { data, error } = await fresh.auth.signInWithPassword({ email: parent.email, password: parent.password });
  assert.ifError(error);
  assert.equal(data.user.id, parent.user.id);
  const { data: after } = await fresh.from('profiles').select('role, public_id').eq('id', parent.user.id).single();
  assert.deepEqual(after, before);

  const wrong = await anonClient().auth.signInWithPassword({ email: parent.email, password: 'wrong-password-1' });
  assert.ok(wrong.error, 'a wrong password is refused');
  assert.equal(wrong.data.session, null);

  await fresh.auth.signOut();
  const { data: afterSignOut } = await fresh.auth.getSession();
  assert.equal(afterSignOut.session, null, 'sign-out clears the session');
});

test('guardians can see and cancel their pending invitation', async () => {
  const none = await stranger.client.rpc('get_link_invite_status');
  assert.ifError(none.error);

  const { data: inv } = await parent.client.rpc('create_link_invite');
  const status = await parent.client.rpc('get_link_invite_status');
  assert.equal(status.data.ok, true);
  assert.ok(status.data.open && status.data.open.expires_at, 'open invite is reported');
  assert.equal(status.data.open.code, undefined, 'the code itself is never returned again');

  const childTry = await child.client.rpc('get_link_invite_status');
  assert.ok(childTry.error, 'children cannot read invite status');

  const revoked = await parent.client.rpc('revoke_link_invite');
  assert.equal(revoked.data, 1);
  const after = await parent.client.rpc('get_link_invite_status');
  assert.equal(after.data.open, null);
  const redeem = await child.client.rpc('redeem_link_invite', { p_code: inv[0].code });
  assert.deepEqual(redeem.data, { ok: false, error: 'invalid_or_expired_code' }, 'a cancelled code no longer links');
});

test('linked family members see each other\'s IDs; unrelated families see nothing', async () => {
  const { data: inv } = await parent.client.rpc('create_link_invite');
  const linked = await child.client.rpc('redeem_link_invite', { p_code: inv[0].code });
  assert.equal(linked.data.ok, true);

  const parentView = await parent.client.from('profiles').select('public_id').eq('id', child.user.id);
  assert.equal(parentView.data.length, 1);
  assert.match(parentView.data[0].public_id, CHILD_ID);

  const childView = await child.client.from('profiles').select('public_id').eq('id', parent.user.id);
  assert.match(childView.data[0].public_id, PARENT_ID);

  const strangerView = await stranger.client.from('profiles').select('id').in('id', [parent.user.id, child.user.id]);
  assert.equal(strangerView.data.length, 0, 'an unrelated guardian cannot see this family');
  // (stranger has its own link to another child from an earlier test; it must not see this family's link)
  const strangerLinks = await stranger.client.from('family_links').select('parent_id, child_id');
  assert.ok(strangerLinks.data.every((l) => l.parent_id === stranger.user.id), 'only its own links are visible');
  assert.ok(!strangerLinks.data.some((l) => l.child_id === child.user.id));
  const strangerLocations = await stranger.client.from('location_updates').select('id').eq('child_id', child.user.id);
  assert.equal(strangerLocations.data.length, 0);
});
