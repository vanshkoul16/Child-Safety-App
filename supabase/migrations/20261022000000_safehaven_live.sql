-- =========================================================
-- SafeHaven live mode: profiles, family links, invitations,
-- location updates, safe zones + geofencing, SOS and push.
--
-- Security model
--   * Every table has RLS enabled. anon gets no table access at all.
--   * Writes that need validation, rate limiting or cross-user effects
--     (linking, location, SOS) go through SECURITY DEFINER functions
--     that check auth.uid() and the caller's role themselves.
--   * Direct table writes are only granted where RLS alone is enough
--     (safe zones, own display name, own push subscriptions).
-- =========================================================

create extension if not exists pgcrypto with schema extensions;

create type public.user_role as enum ('parent', 'child');
create type public.tracking_state as enum ('active', 'paused', 'denied', 'unavailable', 'error');
create type public.zone_transition as enum ('enter', 'exit');
create type public.sos_status as enum ('active', 'acknowledged', 'cancelled', 'resolved');
create type public.notification_status as enum ('queued', 'sent', 'delivered', 'failed', 'no_subscription');

-- ---------------------------------------------------------
-- Tables
-- ---------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  -- Only meaningful for children: how long their raw location history is kept
  location_retention_days integer not null default 7 check (location_retention_days between 1 and 30),
  -- Reported by the child's device so guardians can tell "denied" from "offline"
  tracking_state public.tracking_state,
  tracking_state_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.family_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  child_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);
create index family_links_child_idx on public.family_links (child_id);

-- One-time invitation codes. Only a SHA-256 hash of the code is stored.
create table public.link_invites (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index link_invites_parent_idx on public.link_invites (parent_id, created_at desc);

-- Failed redemption attempts, for brute-force throttling
create table public.invite_redeem_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index invite_redeem_attempts_user_idx on public.invite_redeem_attempts (user_id, attempted_at desc);

create table public.location_updates (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real not null check (accuracy_m > 0 and accuracy_m <= 10000),
  battery_pct smallint check (battery_pct between 0 and 100),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index location_updates_child_idx on public.location_updates (child_id, received_at desc);

create table public.safe_zones (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  radius_m integer not null check (radius_m between 25 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index safe_zones_child_idx on public.safe_zones (child_id);

-- Last known inside/outside state per child and zone; transitions create zone_events
create table public.zone_states (
  child_id uuid not null references public.profiles (id) on delete cascade,
  zone_id uuid not null references public.safe_zones (id) on delete cascade,
  inside boolean not null,
  distance_m real,
  updated_at timestamptz not null default now(),
  primary key (child_id, zone_id)
);
create index zone_states_zone_idx on public.zone_states (zone_id);

create table public.zone_events (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles (id) on delete cascade,
  zone_id uuid references public.safe_zones (id) on delete set null,
  zone_name text not null,
  transition public.zone_transition not null,
  location_id uuid references public.location_updates (id) on delete set null,
  distance_m real not null,
  accuracy_m real not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index zone_events_child_idx on public.zone_events (child_id, occurred_at desc);

create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles (id) on delete cascade,
  status public.sos_status not null default 'active',
  -- Snapshot of the latest known location when SOS was raised (null if none was ever received)
  lat double precision,
  lng double precision,
  accuracy_m real,
  location_recorded_at timestamptz,
  message text check (message is null or char_length(message) <= 280),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null
);
create index sos_alerts_child_idx on public.sos_alerts (child_id, created_at desc);
create unique index sos_alerts_one_open_per_child on public.sos_alerts (child_id)
  where status in ('active', 'acknowledged');

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Per-device delivery record for each SOS. Written only by the server (service role).
create table public.sos_notifications (
  id uuid primary key default gen_random_uuid(),
  sos_id uuid not null references public.sos_alerts (id) on delete cascade,
  parent_id uuid not null references public.profiles (id) on delete cascade,
  subscription_id uuid references public.push_subscriptions (id) on delete set null,
  channel text not null default 'web_push',
  status public.notification_status not null default 'queued',
  detail text,
  receipt_token_hash text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  unique (sos_id, subscription_id)
);
create index sos_notifications_sos_idx on public.sos_notifications (sos_id);

-- ---------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger safe_zones_touch before update on public.safe_zones
  for each row execute function public.touch_updated_at();

-- Great-circle distance in metres
create function public.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable parallel safe set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

create function public.is_parent_of(p_child uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_links
    where parent_id = (select auth.uid()) and child_id = p_child
  );
$$;

create function public.is_child_of(p_parent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_links
    where child_id = (select auth.uid()) and parent_id = p_parent
  );
$$;

create function public.my_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = (select auth.uid());
$$;

-- Raises unless the caller is signed in with the given role
create function public.require_role(p_role public.user_role) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r public.user_role;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select role into r from public.profiles where id = uid;
  if r is distinct from p_role then
    raise exception 'forbidden: % account required', p_role using errcode = '42501';
  end if;
  return uid;
end;
$$;

-- Create the profile row from sign-up metadata. Role is fixed here and never re-read
-- from user metadata afterwards (users can edit their own metadata).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := meta ->> 'role';
  name text := btrim(coalesce(meta ->> 'display_name', ''));
begin
  if r is null or r not in ('parent', 'child') then
    raise exception 'invalid_role: sign-up must specify role parent or child' using errcode = '22023';
  end if;
  if name = '' then
    name := split_part(coalesce(new.email, 'User'), '@', 1);
  end if;
  insert into public.profiles (id, role, display_name)
  values (new.id, r::public.user_role, left(name, 60));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Links must always join a parent account to a child account
create function public.check_family_link_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select role from public.profiles where id = new.parent_id) is distinct from 'parent'
     or (select role from public.profiles where id = new.child_id) is distinct from 'child' then
    raise exception 'invalid_link_roles' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger family_links_roles before insert or update on public.family_links
  for each row execute function public.check_family_link_roles();

-- Safe zones may only be attached to child accounts
create function public.check_safe_zone_child() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select role from public.profiles where id = new.child_id) is distinct from 'child' then
    raise exception 'invalid_zone_child' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger safe_zones_child before insert or update of child_id on public.safe_zones
  for each row execute function public.check_safe_zone_child();

-- Moving or resizing a zone resets its state; the next fix re-establishes it silently
create function public.reset_zone_state() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lat <> old.lat or new.lng <> old.lng or new.radius_m <> old.radius_m or new.child_id <> old.child_id then
    delete from public.zone_states where zone_id = new.id;
  end if;
  return new;
end;
$$;

create trigger safe_zones_reset_state after update on public.safe_zones
  for each row execute function public.reset_zone_state();

-- ---------------------------------------------------------
-- RPC: family linking
-- ---------------------------------------------------------

create function public.create_link_invite()
returns table (code text, expires_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('parent');
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols: no modulo bias
  raw bytea := extensions.gen_random_bytes(8);
  c text := '';
  exp timestamptz := now() + interval '15 minutes';
begin
  if (select count(*) from public.link_invites li
      where li.parent_id = uid and li.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited: too many invitations, try again later' using errcode = 'P0001';
  end if;

  for i in 0..7 loop
    c := c || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;

  -- Only one open invitation per parent at a time
  update public.link_invites li set revoked_at = now()
  where li.parent_id = uid and li.redeemed_at is null and li.revoked_at is null;

  insert into public.link_invites (parent_id, code_hash, expires_at)
  values (uid, encode(extensions.digest(c, 'sha256'), 'hex'), exp);

  return query select left(c, 4) || '-' || right(c, 4), exp;
end;
$$;

-- Returns {ok, error?, parent_id?, parent_name?}. Errors are returned (not raised)
-- so the failed-attempt row used for throttling is kept.
create function public.redeem_link_invite(p_code text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('child');
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  inv public.link_invites;
  pname text;
begin
  if (select count(*) from public.invite_redeem_attempts a
      where a.user_id = uid and a.attempted_at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  if char_length(normalized) <> 8 then
    insert into public.invite_redeem_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  select * into inv from public.link_invites li
  where li.code_hash = encode(extensions.digest(normalized, 'sha256'), 'hex')
    and li.redeemed_at is null and li.revoked_at is null and li.expires_at > now()
  for update;

  if not found then
    insert into public.invite_redeem_attempts (user_id) values (uid);
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_code');
  end if;

  if (select count(*) from public.family_links fl where fl.child_id = uid) >= 4
     and not exists (select 1 from public.family_links fl where fl.child_id = uid and fl.parent_id = inv.parent_id) then
    return jsonb_build_object('ok', false, 'error', 'too_many_guardians');
  end if;

  insert into public.family_links (parent_id, child_id) values (inv.parent_id, uid)
  on conflict (parent_id, child_id) do nothing;

  update public.link_invites set redeemed_at = now(), redeemed_by = uid where id = inv.id;

  select display_name into pname from public.profiles where id = inv.parent_id;
  return jsonb_build_object('ok', true, 'parent_id', inv.parent_id, 'parent_name', pname);
end;
$$;

-- ---------------------------------------------------------
-- RPC: location + geofencing
-- ---------------------------------------------------------

create function public.set_tracking_state(p_state public.tracking_state)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('child');
begin
  update public.profiles set tracking_state = p_state, tracking_state_at = now() where id = uid;
end;
$$;

-- Stores one fix from the child's device and evaluates every safe zone for that child.
-- Geofence rules (documented in docs/LIVE_MODE.md):
--   * fixes less accurate than 150 m are stored but never change zone state
--   * fixes older than the newest stored fix are stored but not evaluated
--   * enter when distance <= radius; exit only when distance > radius + buffer,
--     buffer = clamp(accuracy, 20 m, 100 m) (hysteresis against GPS jitter)
--   * the first evaluation of a zone records state without emitting an event
create function public.submit_location(
  p_lat double precision,
  p_lng double precision,
  p_accuracy real,
  p_recorded_at timestamptz,
  p_battery smallint default null
)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('child');
  last_received timestamptz;
  last_recorded timestamptz;
  loc_id uuid;
  z record;
  prev boolean;
  dist double precision;
  buffer double precision;
  now_inside boolean;
  events jsonb := '[]'::jsonb;
  evaluated boolean;
  retention integer;
begin
  if p_lat is null or p_lng is null or p_accuracy is null or p_recorded_at is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_accuracy <= 0 or p_accuracy > 10000
     or (p_battery is not null and p_battery not between 0 and 100) then
    raise exception 'invalid_input: location out of range' using errcode = '22023';
  end if;
  if p_recorded_at > now() + interval '2 minutes' or p_recorded_at < now() - interval '10 minutes' then
    raise exception 'invalid_input: recorded_at must be within the last 10 minutes' using errcode = '22023';
  end if;
  if not exists (select 1 from public.family_links where child_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select max(received_at), max(recorded_at) into last_received, last_recorded
  from public.location_updates where child_id = uid and received_at > now() - interval '1 hour';
  if last_received is not null and last_received > now() - interval '5 seconds' then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.location_updates (child_id, lat, lng, accuracy_m, battery_pct, recorded_at)
  values (uid, p_lat, p_lng, p_accuracy, p_battery, p_recorded_at)
  returning id into loc_id;

  update public.profiles set tracking_state = 'active', tracking_state_at = now() where id = uid;

  evaluated := p_accuracy <= 150 and (last_recorded is null or p_recorded_at >= last_recorded);

  if evaluated then
    buffer := least(greatest(p_accuracy, 20), 100);
    for z in select * from public.safe_zones where child_id = uid loop
      dist := public.distance_m(p_lat, p_lng, z.lat, z.lng);
      select inside into prev from public.zone_states where child_id = uid and zone_id = z.id;

      if not found then
        now_inside := dist <= z.radius_m;
        insert into public.zone_states (child_id, zone_id, inside, distance_m) values (uid, z.id, now_inside, dist);
        continue;
      end if;

      if prev then
        now_inside := dist <= z.radius_m + buffer;
      else
        now_inside := dist <= z.radius_m;
      end if;

      update public.zone_states set inside = now_inside, distance_m = dist, updated_at = now()
      where child_id = uid and zone_id = z.id;

      if now_inside is distinct from prev then
        insert into public.zone_events (child_id, zone_id, zone_name, transition, location_id, distance_m, accuracy_m, occurred_at)
        values (uid, z.id, z.name, case when now_inside then 'enter' else 'exit' end::public.zone_transition,
                loc_id, dist, p_accuracy, p_recorded_at);
        events := events || jsonb_build_object('zone_id', z.id, 'zone_name', z.name,
                                               'transition', case when now_inside then 'enter' else 'exit' end);
      end if;
    end loop;
  end if;

  -- Data minimisation: drop this child's fixes older than their retention window
  select location_retention_days into retention from public.profiles where id = uid;
  delete from public.location_updates
  where child_id = uid and received_at < now() - make_interval(days => retention);

  return jsonb_build_object('ok', true, 'location_id', loc_id, 'zones_evaluated', evaluated, 'events', events);
end;
$$;

create function public.set_child_retention(p_child uuid, p_days integer)
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_role('parent');
  if not public.is_parent_of(p_child) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 30 then
    raise exception 'invalid_input: retention must be 1-30 days' using errcode = '22023';
  end if;
  update public.profiles set location_retention_days = p_days where id = p_child;
  delete from public.location_updates
  where child_id = p_child and received_at < now() - make_interval(days => p_days);
end;
$$;

-- Parents (for a linked child) or the child (for themself) can wipe raw location history
create function public.delete_location_history(p_child uuid)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  if auth.uid() is null or not (p_child = auth.uid() or public.is_parent_of(p_child)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.location_updates where child_id = p_child;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------
-- RPC: SOS
-- ---------------------------------------------------------

-- Returns {ok, created, sos} or {ok:false, error}. Idempotent while an SOS is open.
create function public.raise_sos(p_message text default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('child');
  existing public.sos_alerts;
  loc public.location_updates;
  created public.sos_alerts;
begin
  if p_message is not null and char_length(p_message) > 280 then
    raise exception 'invalid_input: message too long' using errcode = '22023';
  end if;
  if not exists (select 1 from public.family_links where child_id = uid) then
    return jsonb_build_object('ok', false, 'error', 'not_linked');
  end if;

  select * into existing from public.sos_alerts
  where child_id = uid and status in ('active', 'acknowledged');
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'sos', to_jsonb(existing));
  end if;

  if (select count(*) from public.sos_alerts where child_id = uid and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into loc from public.location_updates
  where child_id = uid order by recorded_at desc limit 1;

  insert into public.sos_alerts (child_id, lat, lng, accuracy_m, location_recorded_at, message)
  values (uid, loc.lat, loc.lng, loc.accuracy_m, loc.recorded_at, nullif(btrim(p_message), ''))
  returning * into created;

  return jsonb_build_object('ok', true, 'created', true, 'sos', to_jsonb(created));
end;
$$;

create function public.cancel_sos(p_sos uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('child');
begin
  update public.sos_alerts set status = 'cancelled', closed_at = now(), closed_by = uid
  where id = p_sos and child_id = uid and status in ('active', 'acknowledged');
  if not found then
    raise exception 'not_found_or_closed' using errcode = 'P0001';
  end if;
end;
$$;

create function public.acknowledge_sos(p_sos uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('parent');
begin
  update public.sos_alerts s set status = 'acknowledged', acknowledged_at = now(), acknowledged_by = uid
  where s.id = p_sos and s.status = 'active' and public.is_parent_of(s.child_id);
  if not found then
    raise exception 'not_found_or_closed' using errcode = 'P0001';
  end if;
end;
$$;

create function public.resolve_sos(p_sos uuid)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := public.require_role('parent');
begin
  update public.sos_alerts s set status = 'resolved', closed_at = now(), closed_by = uid,
    acknowledged_at = coalesce(s.acknowledged_at, now()), acknowledged_by = coalesce(s.acknowledged_by, uid)
  where s.id = p_sos and s.status in ('active', 'acknowledged') and public.is_parent_of(s.child_id);
  if not found then
    raise exception 'not_found_or_closed' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------
-- RPC: push subscriptions
-- ---------------------------------------------------------

-- A browser endpoint belongs to whoever is signed in on it now
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id <> uid;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent
  returning id into sid;
  return sid;
end;
$$;

-- ---------------------------------------------------------
-- Maintenance (service role only)
-- ---------------------------------------------------------

create function public.purge_expired_data()
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  n_loc integer;
  n_inv integer;
  n_att integer;
begin
  delete from public.location_updates l using public.profiles p
  where p.id = l.child_id and l.received_at < now() - make_interval(days => p.location_retention_days);
  get diagnostics n_loc = row_count;

  delete from public.link_invites where expires_at < now() - interval '1 day';
  get diagnostics n_inv = row_count;

  delete from public.invite_redeem_attempts where attempted_at < now() - interval '1 day';
  get diagnostics n_att = row_count;

  return jsonb_build_object('locations', n_loc, 'invites', n_inv, 'attempts', n_att);
end;
$$;

-- ---------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.family_links enable row level security;
alter table public.link_invites enable row level security;
alter table public.invite_redeem_attempts enable row level security;
alter table public.location_updates enable row level security;
alter table public.safe_zones enable row level security;
alter table public.zone_states enable row level security;
alter table public.zone_events enable row level security;
alter table public.sos_alerts enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.sos_notifications enable row level security;

-- Start from nothing, then grant exactly what each role needs
revoke all on public.profiles, public.family_links, public.link_invites, public.invite_redeem_attempts,
  public.location_updates, public.safe_zones, public.zone_states, public.zone_events, public.sos_alerts,
  public.push_subscriptions, public.sos_notifications
  from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, delete on public.family_links to authenticated;
grant select on public.location_updates to authenticated;
grant select, delete on public.safe_zones to authenticated;
grant insert (child_id, name, lat, lng, radius_m) on public.safe_zones to authenticated;
grant update (name, lat, lng, radius_m) on public.safe_zones to authenticated;
grant select on public.zone_states to authenticated;
grant select on public.zone_events to authenticated;
grant select on public.sos_alerts to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select on public.sos_notifications to authenticated;
-- link_invites and invite_redeem_attempts: no direct access, RPC only

create policy "profiles: self, linked parents and linked children"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_parent_of(id) or public.is_child_of(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "family_links: members can read"
  on public.family_links for select to authenticated
  using (parent_id = (select auth.uid()) or child_id = (select auth.uid()));

create policy "family_links: parent can unlink"
  on public.family_links for delete to authenticated
  using (parent_id = (select auth.uid()));

create policy "location_updates: child and linked parents"
  on public.location_updates for select to authenticated
  using (child_id = (select auth.uid()) or public.is_parent_of(child_id));

create policy "safe_zones: child and linked parents can read"
  on public.safe_zones for select to authenticated
  using (child_id = (select auth.uid()) or public.is_parent_of(child_id));

create policy "safe_zones: linked parents can create"
  on public.safe_zones for insert to authenticated
  with check (public.is_parent_of(child_id) and created_by = (select auth.uid()));

create policy "safe_zones: linked parents can edit"
  on public.safe_zones for update to authenticated
  using (public.is_parent_of(child_id)) with check (public.is_parent_of(child_id));

create policy "safe_zones: linked parents can delete"
  on public.safe_zones for delete to authenticated
  using (public.is_parent_of(child_id));

create policy "zone_states: child and linked parents"
  on public.zone_states for select to authenticated
  using (child_id = (select auth.uid()) or public.is_parent_of(child_id));

create policy "zone_events: child and linked parents"
  on public.zone_events for select to authenticated
  using (child_id = (select auth.uid()) or public.is_parent_of(child_id));

create policy "sos_alerts: child and linked parents"
  on public.sos_alerts for select to authenticated
  using (child_id = (select auth.uid()) or public.is_parent_of(child_id));

create policy "push_subscriptions: own"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "sos_notifications: recipient parent or the child"
  on public.sos_notifications for select to authenticated
  using (
    parent_id = (select auth.uid())
    or exists (select 1 from public.sos_alerts s where s.id = sos_id and s.child_id = (select auth.uid()))
  );

-- ---------------------------------------------------------
-- Function privileges (Supabase grants EXECUTE to anon by default)
-- ---------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.is_parent_of(uuid),
  public.is_child_of(uuid),
  public.my_role(),
  public.distance_m(double precision, double precision, double precision, double precision),
  public.create_link_invite(),
  public.redeem_link_invite(text),
  public.set_tracking_state(public.tracking_state),
  public.submit_location(double precision, double precision, real, timestamptz, smallint),
  public.set_child_retention(uuid, integer),
  public.delete_location_history(uuid),
  public.raise_sos(text),
  public.cancel_sos(uuid),
  public.acknowledge_sos(uuid),
  public.resolve_sos(uuid),
  public.save_push_subscription(text, text, text, text)
  to authenticated;

grant execute on function public.purge_expired_data() to service_role;

-- ---------------------------------------------------------
-- Realtime: postgres_changes respects the RLS policies above
-- ---------------------------------------------------------

alter publication supabase_realtime add table
  public.location_updates, public.zone_events, public.sos_alerts, public.sos_notifications,
  public.safe_zones, public.family_links, public.profiles;
