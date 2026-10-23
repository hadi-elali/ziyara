-- Every signed-in account can choose a bus before having a trip assignment.
-- Participant names remain private to their account and to administrators.
begin;

create policy "Signed-in accounts can read the active trip"
on public.trips for select to authenticated
using (archived_at is null);

create policy "Signed-in accounts can read active trip buses"
on public.trip_buses for select to authenticated
using (exists (
  select 1 from public.trips as trips
  where trips.id = trip_id and trips.archived_at is null
));

-- Internal shared mutation. Callers authenticate and resolve the target profile.
-- Use the same lock as the existing group/family/leader assignment APIs and a
-- trip row lock compatible with archival, so no assignment can follow closure.
create or replace function public.move_trip_profile_to_bus(
  p_trip_id bigint, p_bus_id bigint, p_profile_id bigint
)
returns public.trip_participants
language plpgsql
set search_path = ''
as $$
declare
  saved_assignment public.trip_participants;
begin
  perform pg_advisory_xact_lock(2026090600);
  perform 1 from public.trips
  where id = p_trip_id and archived_at is null for update;
  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.trip_buses where id = p_bus_id and trip_id = p_trip_id
  ) then
    raise exception 'Bus does not belong to the active trip.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.bus_boardings where trip_id = p_trip_id and closed_at is null
  ) then
    raise exception 'Close the active boarding before changing bus assignments.' using errcode = '55000';
  end if;

  -- A personal move affects only this account, including former family imports.
  -- A leader leaving a bus vacates that position; they never lead a remote bus.
  update public.trip_buses as buses set leader_participant_id = null
  from public.trip_participants as participants
  where buses.trip_id = p_trip_id and buses.id <> p_bus_id
    and participants.id = buses.leader_participant_id
    and participants.profile_id = p_profile_id;

  select * into saved_assignment from public.ensure_trip_profile_bus_assignment(
    p_trip_id, p_bus_id, p_profile_id, null
  );
  return saved_assignment;
end;
$$;
revoke all on function public.move_trip_profile_to_bus(bigint, bigint, bigint)
from public, anon, authenticated;

create or replace function public.select_trip_bus(p_trip_id bigint, p_bus_id bigint)
returns public.trip_participants
language plpgsql security definer set search_path = ''
as $$
declare
  own_profile_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select id into own_profile_id from public.profiles where user_id = (select auth.uid());
  if own_profile_id is null then
    raise exception 'User profile is required.' using errcode = '42501';
  end if;
  return public.move_trip_profile_to_bus(p_trip_id, p_bus_id, own_profile_id);
end;
$$;

create or replace function public.admin_move_trip_person(
  p_trip_id bigint, p_bus_id bigint, p_user_id uuid
)
returns public.trip_participants
language plpgsql security definer set search_path = ''
as $$
declare
  target_profile_id bigint;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  select id into target_profile_id from public.profiles where user_id = p_user_id;
  if target_profile_id is null then
    raise exception 'Profile not found.' using errcode = 'P0002';
  end if;
  return public.move_trip_profile_to_bus(p_trip_id, p_bus_id, target_profile_id);
end;
$$;

-- Create an empty bus; choosing a leader remains an optional separate admin action.
create or replace function public.admin_create_trip_bus(p_trip_id bigint, p_name text)
returns public.trip_buses
language plpgsql security definer set search_path = ''
as $$
declare
  created_bus public.trip_buses;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(2026090600);
  perform 1 from public.trips
  where id = p_trip_id and archived_at is null for update;
  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;
  insert into public.trip_buses (trip_id, name, sort_order)
  values (p_trip_id, btrim(p_name), coalesce((
    select max(sort_order) + 1 from public.trip_buses where trip_id = p_trip_id
  ), 0)) returning * into created_bus;
  return created_bus;
end;
$$;

create or replace function public.admin_trip_bus_roster(p_trip_id bigint)
returns table (user_id uuid, display_name text, bus_id bigint, participant_id bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trips where id = p_trip_id and archived_at is null) then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;
  return query
  select profiles.user_id, profiles.display_name, assignment.bus_id, assignment.id
  from public.profiles as profiles
  left join lateral (
    select participants.id, participants.bus_id
    from public.trip_participants as participants
    where participants.trip_id = p_trip_id and participants.profile_id = profiles.id
    order by participants.updated_at desc, participants.id desc limit 1
  ) as assignment on true
  order by profiles.display_name, profiles.id;
end;
$$;

revoke all on function public.select_trip_bus(bigint, bigint) from public, anon;
revoke all on function public.admin_move_trip_person(bigint, bigint, uuid) from public, anon;
revoke all on function public.admin_create_trip_bus(bigint, text) from public, anon;
revoke all on function public.admin_trip_bus_roster(bigint) from public, anon;
grant execute on function public.select_trip_bus(bigint, bigint) to authenticated;
grant execute on function public.admin_move_trip_person(bigint, bigint, uuid) to authenticated;
grant execute on function public.admin_create_trip_bus(bigint, text) to authenticated;
grant execute on function public.admin_trip_bus_roster(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
