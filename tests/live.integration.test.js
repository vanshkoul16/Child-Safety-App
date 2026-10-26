// Integration tests for the Supabase schema: auth roles, family linking, RLS,
// location updates, geofencing and SOS. Requires a running Supabase stack
// (`npx supabase start`) with the migrations applied.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const { anonClient, serviceClient, signUp, ageLocations, north } = require('./helpers');

const HOME = { lat: 32.7042, lng: 74.869 };

let parentA, parentB, childC, childD, childE;

async function rpc(who, fn, args) {
  return who.client.rpc(fn, args);
}

async function sendFix(child, point, accuracy = 10) {
  await ageLocations(child.user.id);
  return rpc(child, 'submit_location', {
    p_lat: point.lat, p_lng: point.lng, p_accuracy: accuracy, p_recorded_at: new Date().toISOString()
  });
}

before(async () => {
  [parentA, parentB, childC, childD, childE] = await Promise.all([
    signUp('parent', 'Parent A'),
    signUp('parent', 'Parent B'),
    signUp('child', 'Child C'),
    signUp('child', 'Child D'),
    signUp('child', 'Child E')
  ]);
});

test('sign-up requires a valid role and creates a profile', async () => {
  const { error } = await anonClient().auth.signUp({
    email: `norole-${Date.now()}@safehaven.test`, password: 'Longenough-123', options: { data: { display_name: 'X' } }
  });
  assert.ok(error, 'sign-up without a role must fail');

  const { data } = await parentA.client.from('profiles').select('role, display_name').eq('id', parentA.user.id).single();
  assert.equal(data.role, 'parent');
  assert.equal(data.display_name, 'Parent A');
});

test('users cannot change their own role', async () => {
  const { error } = await childC.client.from('profiles').update({ role: 'parent' }).eq('id', childC.user.id);
  assert.ok(error, 'role column must not be updatable');
  const { data } = await childC.client.from('profiles').select('role').eq('id', childC.user.id).single();
  assert.equal(data.role, 'child');
});

test('anonymous clients cannot read any sensitive table', async () => {
  const anon = anonClient();
  for (const table of ['profiles', 'family_links', 'location_updates', 'safe_zones', 'zone_events', 'sos_alerts', 'push_subscriptions', 'sos_notifications', 'link_invites']) {
    const { data, error } = await anon.from(table).select('*').limit(1);
    assert.ok(error || (data && data.length === 0), `anon read ${table}`);
  }
  const { error } = await anon.rpc('create_link_invite');
  assert.ok(error, 'anon cannot call RPCs');
});

test('only parents can create invitations and only children can redeem them', async () => {
  const childTry = await rpc(childC, 'create_link_invite');
  assert.ok(childTry.error, 'child must not create invites');

  const { data, error } = await rpc(parentA, 'create_link_invite');
  assert.ifError(error);
  const { code, expires_at: expiresAt } = data[0];
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const ttl = new Date(expiresAt).getTime() - Date.now();
  assert.ok(ttl > 14 * 60000 && ttl <= 15 * 60000 + 5000, 'invite expires in ~15 minutes');

  const parentTry = await rpc(parentB, 'redeem_link_invite', { p_code: code });
  assert.ok(parentTry.error, 'parent must not redeem invites');

  const wrong = await rpc(childC, 'redeem_link_invite', { p_code: 'AAAA-AAAA' });
  assert.deepEqual(wrong.data, { ok: false, error: 'invalid_or_expired_code' });

  const ok = await rpc(childC, 'redeem_link_invite', { p_code: code.toLowerCase().replace('-', ' ') });
  assert.equal(ok.data.ok, true);
  assert.equal(ok.data.parent_id, parentA.user.id);

  const reuse = await rpc(childD, 'redeem_link_invite', { p_code: code });
  assert.deepEqual(reuse.data, { ok: false, error: 'invalid_or_expired_code' }, 'codes are single-use');

  const { data: links } = await parentA.client.from('family_links').select('child_id');
  assert.deepEqual(links.map(l => l.child_id), [childC.user.id]);
});

test('expired and superseded invitations cannot be redeemed', async () => {
  const first = (await rpc(parentB, 'create_link_invite')).data[0].code;
  const second = (await rpc(parentB, 'create_link_invite')).data[0].code;
  const old = await rpc(childE, 'redeem_link_invite', { p_code: first });
  assert.equal(old.data.ok, false, 'creating a new invite revokes the previous one');

  await serviceClient().from('link_invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() })
    .eq('parent_id', parentB.user.id).is('redeemed_at', null).is('revoked_at', null);
  const expired = await rpc(childE, 'redeem_link_invite', { p_code: second });
  assert.equal(expired.data.ok, false, 'expired codes are rejected');
});

test('invitation redemption is throttled after repeated failures', async () => {
  let last;
  for (let i = 0; i < 11; i++) last = await rpc(childE, 'redeem_link_invite', { p_code: 'ZZZZ-ZZZZ' });
  assert.deepEqual(last.data, { ok: false, error: 'too_many_attempts' });
});

test('invite codes are never readable through the API', async () => {
  const { data, error } = await parentA.client.from('link_invites').select('*');
  assert.ok(error || data.length === 0);
});

test('location updates are validated, rate limited and private to the family', async () => {
  const unlinked = await rpc(childD, 'submit_location', {
    p_lat: HOME.lat, p_lng: HOME.lng, p_accuracy: 10, p_recorded_at: new Date().toISOString()
  });
  assert.deepEqual(unlinked.data, { ok: false, error: 'not_linked' });

  const bad = await rpc(childC, 'submit_location', {
    p_lat: 123, p_lng: HOME.lng, p_accuracy: 10, p_recorded_at: new Date().toISOString()
  });
  assert.ok(bad.error, 'latitude out of range is rejected');

  const future = await rpc(childC, 'submit_location', {
    p_lat: HOME.lat, p_lng: HOME.lng, p_accuracy: 10, p_recorded_at: new Date(Date.now() + 3600e3).toISOString()
  });
  assert.ok(future.error, 'future timestamps are rejected');

  const first = await rpc(childC, 'submit_location', {
    p_lat: HOME.lat, p_lng: HOME.lng, p_accuracy: 12, p_recorded_at: new Date().toISOString(), p_battery: 64
  });
  assert.ifError(first.error);
  assert.equal(first.data.ok, true);

  const tooFast = await rpc(childC, 'submit_location', {
    p_lat: HOME.lat, p_lng: HOME.lng, p_accuracy: 12, p_recorded_at: new Date().toISOString()
  });
  assert.deepEqual(tooFast.data, { ok: false, error: 'rate_limited' });

  const direct = await childC.client.from('location_updates').insert({
    child_id: childC.user.id, lat: 1, lng: 1, accuracy_m: 5, recorded_at: new Date().toISOString()
  });
  assert.ok(direct.error, 'direct inserts bypassing validation are refused');

  const seenByParent = await parentA.client.from('location_updates').select('lat, lng, accuracy_m, battery_pct').eq('child_id', childC.user.id);
  assert.equal(seenByParent.data.length, 1);
  assert.equal(seenByParent.data[0].battery_pct, 64);

  const seenByStranger = await parentB.client.from('location_updates').select('*').eq('child_id', childC.user.id);
  assert.equal(seenByStranger.data.length, 0, 'another family cannot see the location');
  const seenByOtherChild = await childD.client.from('location_updates').select('*');
  assert.equal(seenByOtherChild.data.length, 0);

  const profileByStranger = await parentB.client.from('profiles').select('*').eq('id', childC.user.id);
  assert.equal(profileByStranger.data.length, 0, 'another family cannot see the child profile');
});

test('safe zones can only be managed by linked parents and are validated', async () => {
  const stranger = await parentB.client.from('safe_zones').insert({ child_id: childC.user.id, name: 'X', lat: HOME.lat, lng: HOME.lng, radius_m: 100 });
  assert.ok(stranger.error, 'unlinked parent cannot add a zone');

  const byChild = await childC.client.from('safe_zones').insert({ child_id: childC.user.id, name: 'X', lat: HOME.lat, lng: HOME.lng, radius_m: 100 });
  assert.ok(byChild.error, 'child cannot add a zone');

  const tooBig = await parentA.client.from('safe_zones').insert({ child_id: childC.user.id, name: 'X', lat: HOME.lat, lng: HOME.lng, radius_m: 999999 });
  assert.ok(tooBig.error, 'radius is range-checked');

  const blank = await parentA.client.from('safe_zones').insert({ child_id: childC.user.id, name: '   ', lat: HOME.lat, lng: HOME.lng, radius_m: 100 });
  assert.ok(blank.error, 'name is required');

  const created = await parentA.client.from('safe_zones')
    .insert({ child_id: childC.user.id, name: 'Home', lat: HOME.lat, lng: HOME.lng, radius_m: 100 })
    .select().single();
  assert.ifError(created.error);
  assert.equal(created.data.created_by, parentA.user.id);

  const edited = await parentA.client.from('safe_zones').update({ name: 'Home (Sector 3)' }).eq('id', created.data.id).select().single();
  assert.equal(edited.data.name, 'Home (Sector 3)');

  const strangerEdit = await parentB.client.from('safe_zones').update({ name: 'pwned' }).eq('id', created.data.id).select();
  assert.equal(strangerEdit.data.length, 0, 'unlinked parent cannot edit');

  const strangerDelete = await parentB.client.from('safe_zones').delete().eq('id', created.data.id).select();
  assert.equal(strangerDelete.data.length, 0, 'unlinked parent cannot delete');

  const childView = await childC.client.from('safe_zones').select('name');
  assert.deepEqual(childView.data.map(z => z.name), ['Home (Sector 3)']);
});

test('geofencing emits one event per real transition and ignores GPS noise', async () => {
  const { data: zone } = await parentA.client.from('safe_zones').select('*').eq('child_id', childC.user.id).single();

  // First evaluation (inside, from the earlier fix or now) records state silently
  let r = await sendFix(childC, north(HOME.lat, HOME.lng, 500));
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.events, [], 'first evaluation emits no event');

  r = await sendFix(childC, north(HOME.lat, HOME.lng, 20));
  assert.deepEqual(r.data.events.map(e => e.transition), ['enter']);

  r = await sendFix(childC, north(HOME.lat, HOME.lng, 30));
  assert.deepEqual(r.data.events, [], 'staying inside emits nothing');

  r = await sendFix(childC, north(HOME.lat, HOME.lng, 115), 10);
  assert.deepEqual(r.data.events, [], 'jitter just past the edge (inside the 20 m buffer) is ignored');

  r = await sendFix(childC, north(HOME.lat, HOME.lng, 600), 400);
  assert.equal(r.data.zones_evaluated, false, 'very inaccurate fixes do not change zone state');
  assert.deepEqual(r.data.events, []);

  r = await sendFix(childC, north(HOME.lat, HOME.lng, 400));
  assert.deepEqual(r.data.events.map(e => e.transition), ['exit']);

  r = await sendFix(childC, north(HOME.lat, HOME.lng, 450));
  assert.deepEqual(r.data.events, [], 'staying outside emits nothing');

  // An out-of-order (older) fix is stored but not evaluated
  await ageLocations(childC.user.id);
  r = await rpc(childC, 'submit_location', {
    p_lat: HOME.lat, p_lng: HOME.lng, p_accuracy: 10, p_recorded_at: new Date(Date.now() - 5 * 60000).toISOString()
  });
  assert.equal(r.data.zones_evaluated, false);

  const events = await parentA.client.from('zone_events').select('transition, zone_name, zone_id').eq('child_id', childC.user.id).order('occurred_at');
  assert.deepEqual(events.data.map(e => e.transition), ['enter', 'exit']);
  assert.equal(events.data[0].zone_id, zone.id);

  const strangerEvents = await parentB.client.from('zone_events').select('*');
  assert.equal(strangerEvents.data.length, 0);

  const direct = await childC.client.from('zone_events').insert({
    child_id: childC.user.id, zone_name: 'fake', transition: 'enter', distance_m: 1, accuracy_m: 1, occurred_at: new Date().toISOString()
  });
  assert.ok(direct.error, 'zone events cannot be forged');
});

test('SOS is authenticated, idempotent, snapshot-located and family-private', async () => {
  const unlinked = await rpc(childD, 'raise_sos', {});
  assert.deepEqual(unlinked.data, { ok: false, error: 'not_linked' });

  const parentTry = await rpc(parentA, 'raise_sos', {});
  assert.ok(parentTry.error, 'parents cannot raise a child SOS through this RPC');

  const first = await rpc(childC, 'raise_sos', { p_message: 'help' });
  assert.ifError(first.error);
  assert.equal(first.data.created, true);
  const sos = first.data.sos;
  assert.equal(sos.child_id, childC.user.id);
  assert.equal(sos.status, 'active');
  assert.ok(sos.lat && sos.lng && sos.location_recorded_at, 'latest location is attached');

  const again = await rpc(childC, 'raise_sos', {});
  assert.equal(again.data.created, false);
  assert.equal(again.data.sos.id, sos.id, 'pressing again returns the open SOS');

  const forged = await childC.client.from('sos_alerts').insert({ child_id: childC.user.id });
  assert.ok(forged.error, 'SOS rows cannot be inserted directly');

  const seen = await parentA.client.from('sos_alerts').select('id, status').eq('id', sos.id);
  assert.equal(seen.data.length, 1);
  const hidden = await parentB.client.from('sos_alerts').select('id').eq('id', sos.id);
  assert.equal(hidden.data.length, 0);

  const strangerAck = await rpc(parentB, 'acknowledge_sos', { p_sos: sos.id });
  assert.ok(strangerAck.error, 'unlinked parent cannot acknowledge');
  assert.equal(strangerAck.status, 400, 'reported as a client error, not a server failure');

  const directUpdate = await parentA.client.from('sos_alerts').update({ status: 'resolved' }).eq('id', sos.id).select();
  assert.ok(directUpdate.error || directUpdate.data.length === 0, 'status changes only via RPC');

  assert.ifError((await rpc(parentA, 'acknowledge_sos', { p_sos: sos.id })).error);
  assert.ifError((await rpc(parentA, 'resolve_sos', { p_sos: sos.id })).error);
  const closed = await parentA.client.from('sos_alerts').select('status, acknowledged_by, closed_by').eq('id', sos.id).single();
  assert.deepEqual(closed.data, { status: 'resolved', acknowledged_by: parentA.user.id, closed_by: parentA.user.id });

  const next = await rpc(childC, 'raise_sos', {});
  assert.equal(next.data.created, true);
  assert.ifError((await rpc(childC, 'cancel_sos', { p_sos: next.data.sos.id })).error);
  const cancelled = await childC.client.from('sos_alerts').select('status').eq('id', next.data.sos.id).single();
  assert.equal(cancelled.data.status, 'cancelled');
});

test('children report tracking state and parents can see it', async () => {
  assert.ifError((await rpc(childC, 'set_tracking_state', { p_state: 'denied' })).error);
  const { data } = await parentA.client.from('profiles').select('tracking_state').eq('id', childC.user.id).single();
  assert.equal(data.tracking_state, 'denied');
  const parentTry = await rpc(parentA, 'set_tracking_state', { p_state: 'active' });
  assert.ok(parentTry.error);
});

test('retention and history deletion are restricted to the family', async () => {
  assert.ok((await rpc(parentB, 'set_child_retention', { p_child: childC.user.id, p_days: 1 })).error);
  assert.ok((await rpc(parentA, 'set_child_retention', { p_child: childC.user.id, p_days: 90 })).error, 'max 30 days');
  assert.ifError((await rpc(parentA, 'set_child_retention', { p_child: childC.user.id, p_days: 1 })).error);

  assert.ok((await rpc(parentB, 'delete_location_history', { p_child: childC.user.id })).error);
  const del = await rpc(parentA, 'delete_location_history', { p_child: childC.user.id });
  assert.ifError(del.error);
  assert.ok(del.data > 0);
  const left = await parentA.client.from('location_updates').select('id').eq('child_id', childC.user.id);
  assert.equal(left.data.length, 0);
});

test('unlinking removes the parent\'s access immediately', async () => {
  await sendFix(childC, HOME);
  const before = await parentA.client.from('location_updates').select('id').eq('child_id', childC.user.id);
  assert.equal(before.data.length, 1);

  const childUnlink = await childC.client.from('family_links').delete().eq('parent_id', parentA.user.id).select();
  assert.equal(childUnlink.data.length, 0, 'children cannot remove a guardian link');

  const removed = await parentA.client.from('family_links').delete().eq('child_id', childC.user.id).select();
  assert.equal(removed.data.length, 1);
  const after = await parentA.client.from('location_updates').select('id').eq('child_id', childC.user.id);
  assert.equal(after.data.length, 0);
  const zones = await parentA.client.from('safe_zones').select('id').eq('child_id', childC.user.id);
  assert.equal(zones.data.length, 0);
});
