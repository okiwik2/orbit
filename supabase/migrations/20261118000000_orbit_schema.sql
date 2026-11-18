-- Orbit schema: circles, live locations, places, chat, SOS, trips, ETA, reminders.
-- Privacy rule: a person's location is visible only to people who share a circle with them
-- where that person has sharing switched on and is not paused.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Server-side config (notify function URL + shared secret). Filled in by setup.sql.
create table private.config (key text primary key, value text not null);

------------------------------------------------------------------ tables
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default 'New member' check (char_length(name) between 1 and 40),
  emoji text not null default '🙂' check (char_length(emoji) between 1 and 8 and emoji !~ '[<>&"'']'),
  color text not null default '#5B7CFA' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  precise boolean not null default true,
  low_battery_alerts boolean not null default true,
  driving_enabled boolean not null default true,
  crash_detection boolean not null default true,
  ha_webhook_url text check (ha_webhook_url is null or ha_webhook_url ~ '^https://'),
  consent_at timestamptz
);

create table public.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'member' check (role in ('admin','member')),
  sharing boolean not null default true,
  paused_until timestamptz,
  notify_places boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
create index on public.circle_members (user_id);

create table public.invites (
  code text primary key,
  circle_id uuid not null references public.circles on delete cascade,
  created_by uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  uses int not null default 0,
  max_uses int not null default 20
);

create table public.locations_latest (
  user_id uuid primary key references auth.users on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  speed real,           -- metres per second
  heading real,
  battery real,         -- 0..1
  charging boolean,
  source text not null default 'app' check (source in ('app','web','owntracks')),
  recorded_at timestamptz not null default now()
);

create table public.location_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  lat double precision not null,
  lng double precision not null,
  accuracy real,
  speed real,
  recorded_at timestamptz not null
);
create index on public.location_history (user_id, recorded_at);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null default 'other' check (kind in ('home','school','work','other')),
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 150 check (radius_m between 50 and 2000),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index on public.places (circle_id);

create table public.place_presence (
  user_id uuid not null references auth.users on delete cascade,
  place_id uuid not null references public.places on delete cascade,
  inside boolean not null,
  changed_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

create table public.place_events (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.places on delete cascade,
  circle_id uuid not null references public.circles on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('arrive','leave')),
  at timestamptz not null default now()
);
create index on public.place_events (circle_id, at desc);

create table public.messages (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.circles on delete cascade,
  user_id uuid references auth.users on delete set null,
  kind text not null default 'text' check (kind in ('text','checkin','sos','system')),
  body text not null check (char_length(body) between 1 and 2000),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index on public.messages (circle_id, created_at desc);

create table public.sos_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  status text not null default 'active' check (status in ('pending','active','cancelled','resolved')),
  reason text not null default 'manual' check (reason in ('manual','crash')),
  lat double precision,
  lng double precision,
  fire_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('expo','web')),
  created_at timestamptz not null default now()
);

create table private.owntracks_tokens (
  user_id uuid primary key references auth.users on delete cascade,
  token_hash text not null
);

create table public.trips (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m real not null default 0,
  max_speed real not null default 0,
  hard_brakes int not null default 0,
  phone_use_s int not null default 0,
  start_lat double precision, start_lng double precision,
  end_lat double precision, end_lng double precision
);
create index on public.trips (user_id, started_at desc);

create table public.eta_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  circle_id uuid not null references public.circles on delete cascade,
  dest_name text not null,
  dest_lat double precision not null,
  dest_lng double precision not null,
  eta_at timestamptz,
  distance_m real,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles on delete cascade,
  place_id uuid not null references public.places on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  for_user uuid references auth.users on delete cascade,   -- null = anyone who arrives
  created_by uuid references auth.users on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

------------------------------------------------------------------ helpers
create or replace function private.is_member(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circle_members where circle_id = c and user_id = auth.uid());
$$;

create or replace function private.is_admin(c uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.circle_members where circle_id = c and user_id = auth.uid() and role = 'admin');
$$;

-- viewer shares any circle with target
create or replace function private.co_member(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select viewer = target or exists (
    select 1 from public.circle_members a join public.circle_members b using (circle_id)
    where a.user_id = target and b.user_id = viewer);
$$;

-- viewer may see target's location (target sharing on, not paused, in a shared circle)
create or replace function private.can_see_location(viewer uuid, target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select viewer = target or exists (
    select 1 from public.circle_members a join public.circle_members b using (circle_id)
    where a.user_id = target and b.user_id = viewer
      and a.sharing and (a.paused_until is null or a.paused_until < now()));
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_member, private.is_admin, private.co_member, private.can_see_location to authenticated;

-- send a push via the notify edge function
create or replace function private.push(recipients uuid[], title text, body text, data jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare url text; secret text;
begin
  if recipients is null or cardinality(recipients) = 0 then return; end if;
  select value into url from private.config where key = 'notify_url';
  select value into secret from private.config where key = 'notify_secret';
  if url is null then return; end if;
  perform net.http_post(
    url := url,
    headers := jsonb_build_object('Content-Type','application/json','x-orbit-secret', secret),
    body := jsonb_build_object('recipients', to_jsonb(recipients), 'title', title, 'body', body, 'data', data));
end $$;

create or replace function private.haversine(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

------------------------------------------------------------------ new user
create or replace function private.on_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name) values (new.id, coalesce(split_part(new.email, '@', 1), 'New member'));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.on_new_user();

------------------------------------------------------------------ location trigger: history, geofences, battery
create or replace function private.on_location() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p record; was_inside boolean; now_inside boolean; d double precision;
  who text; recips uuid[]; settings public.user_settings;
begin
  insert into public.location_history (user_id, lat, lng, accuracy, speed, recorded_at)
  values (new.user_id, new.lat, new.lng, new.accuracy, new.speed, new.recorded_at);

  select name into who from public.profiles where id = new.user_id;
  select * into settings from public.user_settings where user_id = new.user_id;

  -- geofences: only for circles where this person is actively sharing
  for p in
    select pl.* from public.places pl
    join public.circle_members m on m.circle_id = pl.circle_id and m.user_id = new.user_id
    where m.sharing and (m.paused_until is null or m.paused_until < now())
  loop
    d := private.haversine(new.lat, new.lng, p.lat, p.lng);
    select inside into was_inside from public.place_presence where user_id = new.user_id and place_id = p.id;
    -- hysteresis: enter inside radius, leave beyond radius + 60 m; ignore very inaccurate fixes
    if coalesce(new.accuracy, 0) > greatest(p.radius_m, 200) then continue; end if;
    if was_inside is null then
      now_inside := d <= p.radius_m;
      insert into public.place_presence (user_id, place_id, inside) values (new.user_id, p.id, now_inside);
      continue;  -- first sighting sets state silently
    end if;
    now_inside := case when was_inside then d <= p.radius_m + 60 else d <= p.radius_m end;
    if now_inside is distinct from was_inside then
      update public.place_presence set inside = now_inside, changed_at = now()
        where user_id = new.user_id and place_id = p.id;
      insert into public.place_events (place_id, circle_id, user_id, kind)
        values (p.id, p.circle_id, new.user_id, case when now_inside then 'arrive' else 'leave' end);

      select array_agg(user_id) into recips from public.circle_members
        where circle_id = p.circle_id and user_id <> new.user_id and notify_places;
      perform private.push(recips,
        case when now_inside then who || ' arrived at ' || p.name else who || ' left ' || p.name end,
        to_char(now() at time zone 'Pacific/Auckland', 'HH12:MI am'),
        jsonb_build_object('type','place','circle_id',p.circle_id,'user_id',new.user_id));

      if now_inside then
        -- location reminders for the person arriving
        perform private.push(array[new.user_id], 'Reminder at ' || p.name, r.body,
          jsonb_build_object('type','reminder','reminder_id', r.id))
        from public.reminders r
        where r.place_id = p.id and not r.done and (r.for_user is null or r.for_user = new.user_id);
      end if;

      -- Home Assistant webhook (home places only)
      if p.kind = 'home' and settings.ha_webhook_url is not null then
        perform net.http_post(url := settings.ha_webhook_url,
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := jsonb_build_object('person', who, 'event', case when now_inside then 'arrive' else 'leave' end,
                                     'place', p.name, 'at', now()));
      end if;
    end if;
  end loop;

  -- low battery alert, once per drop below 15%
  if tg_op = 'UPDATE' and settings.low_battery_alerts and new.battery is not null
     and new.battery < 0.15 and coalesce(old.battery, 1) >= 0.15 and not coalesce(new.charging, false) then
    select array_agg(distinct b.user_id) into recips
      from public.circle_members a join public.circle_members b using (circle_id)
      where a.user_id = new.user_id and b.user_id <> new.user_id and a.sharing;
    perform private.push(recips, who || '''s phone is low on battery',
      round(new.battery * 100) || '% left', jsonb_build_object('type','battery','user_id',new.user_id));
  end if;

  -- auto-end ETA shares on arrival (within 150 m)
  update public.eta_shares set active = false, updated_at = now()
    where user_id = new.user_id and active
      and private.haversine(new.lat, new.lng, dest_lat, dest_lng) < 150;
  return new;
end $$;

create trigger on_location after insert or update on public.locations_latest
  for each row execute function private.on_location();

------------------------------------------------------------------ SOS trigger
create or replace function private.on_sos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who text; recips uuid[]; c uuid;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status <> 'active') then
    select name into who from public.profiles where id = new.user_id;
    select array_agg(distinct b.user_id) into recips
      from public.circle_members a join public.circle_members b using (circle_id)
      where a.user_id = new.user_id and b.user_id <> new.user_id;
    perform private.push(recips, '🚨 SOS from ' || who,
      case when new.reason = 'crash' then 'Possible crash detected. Tap to see their location.'
           else 'They need help now. Tap to see their location.' end,
      jsonb_build_object('type','sos','sos_id',new.id,'user_id',new.user_id,'lat',new.lat,'lng',new.lng));
    for c in select circle_id from public.circle_members where user_id = new.user_id loop
      insert into public.messages (circle_id, user_id, kind, body, lat, lng)
      values (c, new.user_id, 'sos',
        case when new.reason = 'crash' then 'Possible crash detected — SOS sent' else 'SOS — I need help' end,
        new.lat, new.lng);
    end loop;
  elsif new.status = 'resolved' and tg_op = 'UPDATE' and old.status = 'active' then
    select name into who from public.profiles where id = new.user_id;
    select array_agg(distinct b.user_id) into recips
      from public.circle_members a join public.circle_members b using (circle_id)
      where a.user_id = new.user_id and b.user_id <> new.user_id;
    perform private.push(recips, who || ' is safe', 'SOS has been cancelled.',
      jsonb_build_object('type','sos_resolved','user_id',new.user_id));
  end if;
  return new;
end $$;
create trigger on_sos after insert or update on public.sos_alerts
  for each row execute function private.on_sos();

------------------------------------------------------------------ RPCs
create or replace function public.create_circle(circle_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.circles (name, created_by) values (circle_name, auth.uid()) returning id into cid;
  insert into public.circle_members (circle_id, user_id, role) values (cid, auth.uid(), 'admin');
  return cid;
end $$;

create or replace function public.create_invite(circle uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare c text;
begin
  if not private.is_member(circle) then raise exception 'not a member'; end if;
  c := upper(substr(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=0O1Il', ''), 1, 8));
  insert into public.invites (code, circle_id, created_by) values (c, circle, auth.uid());
  return c;
end $$;

create or replace function public.join_circle(invite_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inv public.invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if inv is null or inv.expires_at < now() or inv.uses >= inv.max_uses then
    raise exception 'This invite is invalid or has expired';
  end if;
  insert into public.circle_members (circle_id, user_id) values (inv.circle_id, auth.uid())
    on conflict do nothing;
  update public.invites set uses = uses + 1 where code = inv.code;
  insert into public.messages (circle_id, user_id, kind, body)
    select inv.circle_id, auth.uid(), 'system', name || ' joined the circle' from public.profiles where id = auth.uid();
  return inv.circle_id;
end $$;

create or replace function public.circle_preview(invite_code text) returns table (name text, members bigint)
language sql stable security definer set search_path = '' as $$
  select c.name, (select count(*) from public.circle_members m where m.circle_id = c.id)
  from public.invites i join public.circles c on c.id = i.circle_id
  where i.code = upper(trim(invite_code)) and i.expires_at > now() and i.uses < i.max_uses;
$$;

create or replace function public.remove_member(circle uuid, member uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if member <> auth.uid() and not private.is_admin(circle) then raise exception 'only admins can remove others'; end if;
  delete from public.circle_members where circle_id = circle and user_id = member;
  -- clean up empty circles
  delete from public.circles c where c.id = circle
    and not exists (select 1 from public.circle_members where circle_id = circle);
end $$;

create or replace function public.new_owntracks_token() returns text
language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.owntracks_tokens (user_id, token_hash)
    values (auth.uid(), encode(extensions.digest(t, 'sha256'), 'hex'))
    on conflict (user_id) do update set token_hash = excluded.token_hash;
  return t;
end $$;

-- used by the owntracks edge function (service role only)
create or replace function public.owntracks_check(uid uuid, token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.owntracks_tokens
    where user_id = uid and token_hash = encode(extensions.digest(token, 'sha256'), 'hex'));
$$;
revoke execute on function public.owntracks_check from public, anon, authenticated;

create or replace function public.delete_my_history() returns void
language sql security definer set search_path = '' as $$
  delete from public.location_history where user_id = auth.uid();
  delete from public.trips where user_id = auth.uid();
  delete from public.place_events where user_id = auth.uid();
$$;

create or replace function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;

------------------------------------------------------------------ RLS
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.invites enable row level security;
alter table public.locations_latest enable row level security;
alter table public.location_history enable row level security;
alter table public.places enable row level security;
alter table public.place_presence enable row level security;
alter table public.place_events enable row level security;
alter table public.messages enable row level security;
alter table public.sos_alerts enable row level security;
alter table public.push_tokens enable row level security;
alter table public.trips enable row level security;
alter table public.eta_shares enable row level security;
alter table public.reminders enable row level security;

create policy "see co-members" on public.profiles for select using (private.co_member(auth.uid(), id));
create policy "edit self" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "own settings" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members see circle" on public.circles for select using (private.is_member(id));
create policy "admins rename" on public.circles for update using (private.is_admin(id));

create policy "members see members" on public.circle_members for select using (private.is_member(circle_id));
create policy "edit own membership" on public.circle_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members see invites" on public.invites for select using (private.is_member(circle_id));

create policy "see shared" on public.locations_latest for select using (private.can_see_location(auth.uid(), user_id));
create policy "write own" on public.locations_latest for insert with check (user_id = auth.uid());
create policy "update own" on public.locations_latest for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "see shared" on public.location_history for select using (private.can_see_location(auth.uid(), user_id));
create policy "see shared" on public.trips for select using (private.can_see_location(auth.uid(), user_id));
create policy "write own" on public.trips for insert with check (user_id = auth.uid());

create policy "members" on public.places for all using (private.is_member(circle_id)) with check (private.is_member(circle_id));
create policy "own" on public.place_presence for select using (user_id = auth.uid());
create policy "members" on public.place_events for select
  using (private.is_member(circle_id) and private.can_see_location(auth.uid(), user_id));

create policy "members read" on public.messages for select using (private.is_member(circle_id));
create policy "members write" on public.messages for insert
  with check (private.is_member(circle_id) and user_id = auth.uid() and kind in ('text','checkin'));

create policy "co-members see" on public.sos_alerts for select using (private.co_member(auth.uid(), user_id));
create policy "raise own" on public.sos_alerts for insert with check (user_id = auth.uid());
create policy "update own" on public.sos_alerts for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own" on public.push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "circle sees" on public.eta_shares for select using (private.is_member(circle_id));
create policy "own" on public.eta_shares for insert with check (user_id = auth.uid() and private.is_member(circle_id));
create policy "own update" on public.eta_shares for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members" on public.reminders for all using (private.is_member(circle_id)) with check (private.is_member(circle_id));

------------------------------------------------------------------ realtime
alter publication supabase_realtime add table
  public.locations_latest, public.messages, public.sos_alerts, public.eta_shares,
  public.circle_members, public.places, public.place_events, public.profiles;

------------------------------------------------------------------ scheduled jobs
-- crash SOS fires after its 30 s grace period unless cancelled
select cron.schedule('orbit-sos-fire', '10 seconds',
  $$update public.sos_alerts set status = 'active' where status = 'pending' and fire_at <= now()$$);
-- 7-day retention
select cron.schedule('orbit-retention', '17 3 * * *', $$
  delete from public.location_history where recorded_at < now() - interval '7 days';
  delete from public.trips where started_at < now() - interval '7 days';
  delete from public.place_events where at < now() - interval '7 days';
  delete from public.eta_shares where updated_at < now() - interval '1 day';
  delete from public.invites where expires_at < now();
$$);
