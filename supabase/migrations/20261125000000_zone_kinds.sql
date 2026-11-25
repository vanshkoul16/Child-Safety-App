-- ---------------------------------------------------------
-- Zone kinds: safe zones and restricted zones.
--   safe        places the child is expected to be (home, school).
--               Arriving is good news; leaving is worth a look.
--   restricted  places the child should stay out of (a busy road, a river bank).
--               Entering is the alert; leaving is the all-clear.
-- Existing zones stay safe zones. Geofencing (accuracy gating, hysteresis,
-- silent first evaluation) is the same for both kinds; zone_events keep a
-- snapshot of the kind so history reads correctly after a zone is deleted.
-- ---------------------------------------------------------

create type public.zone_kind as enum ('safe', 'restricted');

alter table public.safe_zones
  add column kind public.zone_kind not null default 'safe';

alter table public.zone_events
  add column zone_kind public.zone_kind not null default 'safe';

-- Column grants are additive: guardians can set the kind when creating or editing a zone
grant insert (kind) on public.safe_zones to authenticated;
grant update (kind) on public.safe_zones to authenticated;

-- Same as 20261022000000_safehaven_live.sql, plus the zone kind on each event
create or replace function public.submit_location(
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
        insert into public.zone_events (child_id, zone_id, zone_name, zone_kind, transition, location_id, distance_m, accuracy_m, occurred_at)
        values (uid, z.id, z.name, z.kind, case when now_inside then 'enter' else 'exit' end::public.zone_transition,
                loc_id, dist, p_accuracy, p_recorded_at);
        events := events || jsonb_build_object('zone_id', z.id, 'zone_name', z.name, 'zone_kind', z.kind,
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
