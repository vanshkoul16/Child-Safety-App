-- pgTAP tests for the sign-up trigger and onboarding (run: npm run test:db).
-- Inserts auth.users rows the way Supabase Auth does for Google and email sign-ups.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;

select plan(16);

-- Google sign-up: no password, provider google. Even a role claim in provider metadata is ignored.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, encrypted_password, created_at, updated_at)
values ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'google-user@example.test', '{"provider":"google","providers":["google"]}', '{"full_name":"Google User","role":"parent"}', '', now(), now());

select is((select count(*)::int from public.profiles where id = 'a1111111-1111-4111-8111-111111111111'), 0,
  'Google sign-up does not create a profile (pending onboarding)');

-- Email sign-up without a role still fails; with a role it still creates the profile
select throws_ok($$
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, encrypted_password, created_at, updated_at)
  values ('b2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'email-norole@example.test', '{"provider":"email","providers":["email"]}', '{}', 'x', now(), now())
$$, '22023', NULL, 'email sign-up without a role is rejected');

insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, encrypted_password, created_at, updated_at)
values ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'email-child@example.test', '{"provider":"email","providers":["email"]}', '{"role":"child","display_name":"Kid"}', 'x', now(), now());
select is((select role::text from public.profiles where id = 'c3333333-3333-4333-8333-333333333333'), 'child',
  'email sign-up with a role creates the profile');
select matches((select public_id from public.profiles where id = 'c3333333-3333-4333-8333-333333333333'), '^C-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$',
  'child gets a C- public ID');

-- Act as the pending Google user
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select throws_ok('select public.create_link_invite()', '42501', NULL, 'pending user cannot act as a parent');
select throws_ok($$select public.redeem_link_invite('AAAA-AAAA')$$, '42501', NULL, 'pending user cannot act as a child');
select is((select count(*)::int from public.profiles), 0, 'pending user sees no profiles');
select is(public.complete_onboarding('admin', 'G'), '{"ok": false, "error": "invalid_role"}'::jsonb, 'unknown roles are refused');
select throws_ok($$select public.complete_onboarding('parent', '  ')$$, '22023', NULL, 'blank display name is refused');

select is((public.complete_onboarding('parent', 'Google User') ->> 'role'), 'parent', 'onboarding assigns the chosen role');
select is((public.complete_onboarding('child', 'Google User') ->> 'error'), 'already_onboarded', 'second onboarding is refused');
select is((select role::text from public.profiles where id = 'a1111111-1111-4111-8111-111111111111'), 'parent', 'role is unchanged');
select matches((select public_id from public.profiles where id = 'a1111111-1111-4111-8111-111111111111'), '^P-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$',
  'parent gets a P- public ID');
select lives_ok('select public.create_link_invite()', 'onboarded parent can create invites');
reset role;

-- Nobody, not even the table owner, can change role or public ID afterwards
select throws_ok($$update public.profiles set role = 'child' where id = 'a1111111-1111-4111-8111-111111111111'$$,
  '42501', NULL, 'role is immutable');

-- Anonymous Supabase sessions cannot onboard
insert into auth.users (id, instance_id, aud, role, raw_app_meta_data, raw_user_meta_data, encrypted_password, is_anonymous, created_at, updated_at)
values ('d4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        '{"provider":"anonymous"}', '{}', '', true, now(), now());
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d4444444-4444-4444-8444-444444444444","role":"authenticated","is_anonymous":true}', true);
select throws_ok($$select public.complete_onboarding('parent', 'Anon')$$, '42501', NULL, 'anonymous sessions cannot onboard');
reset role;

select * from finish();
rollback;
