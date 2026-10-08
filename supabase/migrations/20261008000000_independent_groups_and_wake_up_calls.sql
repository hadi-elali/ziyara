-- Groups cover the whole journey and refer directly to registered accounts.
-- Legacy trip groups remain available to old clients; copy active assignments once.
create table public.organization_groups (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index organization_groups_name_unique on public.organization_groups (name);
create trigger organization_groups_updated_at before update on public.organization_groups
for each row execute function public.set_bus_management_updated_at();

create table public.organization_group_members (
  group_id bigint not null references public.organization_groups on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  is_leader boolean not null default false,
  primary key (group_id, user_id),
  unique (user_id)
);
create table public.organization_group_location_requests (
  id bigint generated always as identity primary key,
  group_id bigint not null,
  leader_user_id uuid not null,
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  status public.trip_group_location_status not null default 'pending',
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy_meters double precision check (accuracy_meters between 0 and 100000),
  location_expires_at timestamptz,
  unique(group_id, leader_user_id),
  foreign key (group_id, leader_user_id) references public.organization_group_members(group_id, user_id) on delete cascade,
  check (
    (status = 'pending' and responded_at is null and latitude is null and longitude is null and accuracy_meters is null and location_expires_at is null)
    or (status = 'shared' and responded_at is not null and latitude is not null and longitude is not null and location_expires_at is not null)
    or (status = 'declined' and responded_at is not null and latitude is null and longitude is null and accuracy_meters is null and location_expires_at is not null)
  )
);

-- Do not copy past location consent to the new independent groups.
do $$
declare old_group record; new_id bigint;
begin
  for old_group in select g.* from public.trip_groups g join public.trips t on t.id = g.trip_id where t.archived_at is null order by g.id loop
    insert into public.organization_groups(name) values(old_group.name) returning id into new_id;
    insert into public.organization_group_members(group_id, user_id, is_leader)
      select new_id, p.user_id, bool_or(m.participant_id = old_group.leader_participant_id)
      from public.trip_group_members m join public.trip_participants tp on tp.id = m.participant_id
      join public.profiles p on p.id = tp.profile_id where m.group_id = old_group.id
      group by p.user_id;
  end loop;
end;
$$;

create function public.is_organization_group_member(p_group_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.organization_group_members where group_id = p_group_id and user_id = (select auth.uid()));
$$;
revoke all on function public.is_organization_group_member(bigint) from public, anon;
grant execute on function public.is_organization_group_member(bigint) to authenticated;

alter table public.organization_groups enable row level security;
alter table public.organization_group_members enable row level security;
alter table public.organization_group_location_requests enable row level security;
revoke all on public.organization_groups, public.organization_group_members, public.organization_group_location_requests from anon, authenticated;
grant select on public.organization_groups, public.organization_group_members, public.organization_group_location_requests to authenticated;
create policy organization_groups_read on public.organization_groups for select to authenticated
using ((select public.is_admin()) or public.is_organization_group_member(id));
create policy organization_group_members_read on public.organization_group_members for select to authenticated
using ((select public.is_admin()) or public.is_organization_group_member(group_id));
create policy organization_group_locations_read on public.organization_group_location_requests for select to authenticated
using ((status = 'pending' or location_expires_at > now()) and ((select public.is_admin()) or leader_user_id = (select auth.uid())));

create function public.get_organization_group_members() returns table (
  group_id bigint, user_id uuid, display_name text, party_size integer, family_name text, is_leader boolean
) language sql stable security definer set search_path = '' as $$
  select m.group_id, m.user_id, p.display_name, p.party_size::integer, f.name, m.is_leader
  from public.organization_group_members m join public.profiles p on p.user_id = m.user_id
  left join public.account_families f on f.id = p.family_id
  where (select auth.uid()) is not null and ((select public.is_admin()) or public.is_organization_group_member(m.group_id))
  order by m.group_id, p.display_name;
$$;

create function public.admin_save_organization_group(
  p_name text, p_leader_user_ids uuid[], p_member_user_ids uuid[], p_family_ids bigint[] default '{}', p_group_id bigint default null
) returns public.organization_groups language plpgsql security definer set search_path = '' as $$
declare members uuid[]; saved public.organization_groups;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(20261008, 1);
  if p_name is null or char_length(btrim(p_name)) not between 2 and 80 then raise exception 'Group name must contain 2–80 characters.' using errcode = '22023'; end if;
  if cardinality(p_leader_user_ids) is null or cardinality(p_leader_user_ids) < 1 or array_position(p_leader_user_ids, null) is not null then
    raise exception 'At least one registered group leader is required.' using errcode = '22023';
  end if;
  if exists(select 1 from unnest(p_family_ids) f(id) where not exists(select 1 from public.account_families a where a.id = f.id)) then
    raise exception 'Family not found.' using errcode = 'P0002';
  end if;
  select array_agg(distinct id) into members from (
    select unnest(p_member_user_ids) id union select unnest(p_leader_user_ids)
    union select user_id from public.profiles where family_id = any(p_family_ids)
  ) all_members;
  if cardinality(members) > 1000 or array_position(members, null) is not null or
    (select count(*) from public.profiles where user_id = any(members)) <> cardinality(members) then
    raise exception 'Valid registered group members are required (maximum 1000 accounts).' using errcode = '22023';
  end if;
  if exists(select 1 from public.organization_group_members where user_id = any(members) and (p_group_id is null or group_id <> p_group_id)) then
    raise exception 'Eine Person oder ein Familienmitglied gehört bereits zu einer anderen Gruppe.' using errcode = '23505';
  end if;
  if p_group_id is null then
    insert into public.organization_groups(name) values(btrim(p_name)) returning * into saved;
  else
    update public.organization_groups set name = btrim(p_name) where id = p_group_id returning * into saved;
    if not found then raise exception 'Group not found.' using errcode = 'P0002'; end if;
    -- Membership and leadership changes invalidate every outstanding location request.
    delete from public.organization_group_members where group_id = p_group_id;
  end if;
  insert into public.organization_group_members(group_id, user_id, is_leader)
    select saved.id, id, id = any(p_leader_user_ids) from unnest(members) m(id);
  return saved;
end;
$$;
create function public.admin_delete_organization_group(p_group_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(20261008, 1);
  delete from public.organization_groups where id = p_group_id;
  if not found then raise exception 'Group not found.' using errcode = 'P0002'; end if;
end;
$$;
create function public.admin_request_organization_group_location(p_group_id bigint, p_leader_user_id uuid)
returns public.organization_group_location_requests language plpgsql security definer set search_path = '' as $$
declare saved public.organization_group_location_requests;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(20261008, 1);
  if not exists(select 1 from public.organization_group_members where group_id = p_group_id and user_id = p_leader_user_id and is_leader) then
    raise exception 'Group leader not found.' using errcode = 'P0002';
  end if;
  -- A fresh ID prevents a delayed response from answering a replacement request.
  delete from public.organization_group_location_requests where group_id = p_group_id and leader_user_id = p_leader_user_id;
  insert into public.organization_group_location_requests(group_id, leader_user_id) values(p_group_id, p_leader_user_id) returning * into saved;
  return saved;
end;
$$;
create function public.respond_to_organization_group_location(
  p_request_id bigint, p_share boolean, p_latitude double precision default null,
  p_longitude double precision default null, p_accuracy_meters double precision default null
) returns public.organization_group_location_requests language plpgsql security definer set search_path = '' as $$
declare saved public.organization_group_location_requests;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(20261008, 1);
  if p_share is null or (p_share and (p_latitude is null or p_longitude is null)) then raise exception 'Valid coordinates and explicit consent required.' using errcode = '22023'; end if;
  update public.organization_group_location_requests r set
    status = case when p_share then 'shared'::public.trip_group_location_status else 'declined'::public.trip_group_location_status end,
    responded_at = now(), latitude = case when p_share then p_latitude end,
    longitude = case when p_share then p_longitude end, accuracy_meters = case when p_share then p_accuracy_meters end,
    location_expires_at = now() + interval '15 minutes'
  where r.id = p_request_id and r.status = 'pending' and r.leader_user_id = (select auth.uid())
    and exists(select 1 from public.organization_group_members m where m.group_id = r.group_id and m.user_id = r.leader_user_id and m.is_leader)
  returning r.* into saved;
  if not found then raise exception 'Pending location request not found.' using errcode = 'P0002'; end if;
  return saved;
end;
$$;

-- A wake-up call is independent of buses, intermediate trips and location requests.
create table public.wake_up_calls (
  id bigint generated always as identity primary key,
  message text not null check(char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  created_by_user_id uuid references public.profiles(user_id) on delete set null
);
create unique index one_active_wake_up_call on public.wake_up_calls ((true)) where closed_at is null;
create table public.wake_up_call_recipients (
  call_id bigint not null references public.wake_up_calls on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  acknowledged_at timestamptz,
  primary key(call_id, user_id)
);
create index wake_up_call_recipients_user_idx on public.wake_up_call_recipients(user_id);
alter table public.wake_up_calls enable row level security;
alter table public.wake_up_call_recipients enable row level security;
revoke all on public.wake_up_calls, public.wake_up_call_recipients from anon, authenticated;
grant select on public.wake_up_calls, public.wake_up_call_recipients to authenticated;
create policy wake_up_calls_read on public.wake_up_calls for select to authenticated
using ((select public.is_admin()) or exists(select 1 from public.wake_up_call_recipients where call_id = id and user_id = (select auth.uid())));
create policy wake_up_call_recipients_read on public.wake_up_call_recipients for select to authenticated
using ((select public.is_admin()) or user_id = (select auth.uid()));
create function public.admin_start_wake_up_call(p_message text) returns public.wake_up_calls
language plpgsql security definer set search_path = '' as $$
declare saved public.wake_up_calls;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  insert into public.wake_up_calls(message, created_by_user_id) values(btrim(p_message), auth.uid()) returning * into saved;
  insert into public.wake_up_call_recipients(call_id, user_id) select saved.id, user_id from public.profiles;
  return saved;
end;
$$;
create function public.admin_close_wake_up_call(p_call_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  update public.wake_up_calls set closed_at = now() where id = p_call_id and closed_at is null;
  if not found then raise exception 'Active wake-up call not found.' using errcode = 'P0002'; end if;
end;
$$;
create function public.acknowledge_wake_up_call(p_call_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.wake_up_calls where id = p_call_id and closed_at is null for update;
  if not found then raise exception 'Active wake-up call not found.' using errcode = 'P0002'; end if;
  update public.wake_up_call_recipients set acknowledged_at = coalesce(acknowledged_at, now()) where call_id = p_call_id and user_id = (select auth.uid());
  if not found then raise exception 'Recipient not found.' using errcode = '42501'; end if;
end;
$$;

create table public.wake_up_notification_attempts (
  id bigint generated always as identity primary key,
  call_id bigint not null references public.wake_up_calls on delete cascade,
  device_id bigint not null references public.push_notification_devices on delete cascade,
  accepted boolean,
  completed_at timestamptz,
  unique(call_id, device_id)
);
alter table public.wake_up_notification_attempts enable row level security;
revoke all on public.wake_up_notification_attempts from anon, authenticated;
grant select, update on public.wake_up_notification_attempts to service_role;
create function public.claim_wake_up_notifications(p_call_id bigint, p_requester_user_id uuid)
returns table(attempt_id bigint, expo_push_token text, locale text, message text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where user_id = p_requester_user_id and role = 'admin') then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  return query with claimed as (
    insert into public.wake_up_notification_attempts(call_id, device_id)
    select c.id, d.id from public.wake_up_calls c
    join public.wake_up_call_recipients r on r.call_id = c.id
    join public.profiles p on p.user_id = r.user_id
    join public.push_notification_devices d on d.profile_id = p.id
    where c.id = p_call_id and c.closed_at is null and r.acknowledged_at is null
    on conflict do nothing returning id, device_id
  ) select a.id, d.expo_push_token, d.locale, c.message from claimed a
    join public.push_notification_devices d on d.id = a.device_id
    join public.wake_up_calls c on c.id = p_call_id;
end;
$$;
revoke all on function public.claim_wake_up_notifications(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_wake_up_notifications(bigint, uuid) to service_role;

-- Only the documented RPCs write application data.
do $$
declare signature text; table_name text;
begin
  foreach signature in array array[
    'get_organization_group_members()',
    'admin_save_organization_group(text,uuid[],uuid[],bigint[],bigint)',
    'admin_delete_organization_group(bigint)',
    'admin_request_organization_group_location(bigint,uuid)',
    'respond_to_organization_group_location(bigint,boolean,double precision,double precision,double precision)',
    'admin_start_wake_up_call(text)', 'admin_close_wake_up_call(bigint)', 'acknowledge_wake_up_call(bigint)'
  ] loop
    execute 'revoke all on function public.' || signature || ' from public, anon';
    execute 'grant execute on function public.' || signature || ' to authenticated';
  end loop;
  foreach table_name in array array['organization_groups','organization_group_members','organization_group_location_requests','wake_up_calls','wake_up_call_recipients'] loop
    execute format('alter publication supabase_realtime add table public.%I', table_name);
  end loop;
end;
$$;
notify pgrst, 'reload schema';
