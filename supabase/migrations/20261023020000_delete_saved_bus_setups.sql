-- Removing a saved arrangement must preserve historical trip records.
begin;

alter table public.trips add column bus_setup_deleted_at timestamptz;
comment on column public.trips.bus_setup_deleted_at is
  'When the archived bus setup was removed from reusable arrangements. Trip history remains available.';

create or replace function public.admin_delete_trip_bus_setup(p_trip_id bigint)
returns public.trips
language plpgsql security definer set search_path = ''
as $$
declare
  saved_trip public.trips;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  -- Share the copy/assignment lock: copying and removing a setup are ordered.
  perform pg_advisory_xact_lock(2026090600);
  select * into saved_trip from public.trips where id = p_trip_id for update;
  if saved_trip.id is null or saved_trip.archived_at is null then
    raise exception 'Saved bus setup not found.' using errcode = 'P0002';
  end if;
  update public.trips set bus_setup_deleted_at = coalesce(bus_setup_deleted_at, now())
  where id = p_trip_id returning * into saved_trip;
  return saved_trip;
end;
$$;
revoke all on function public.admin_delete_trip_bus_setup(bigint) from public, anon;
grant execute on function public.admin_delete_trip_bus_setup(bigint) to authenticated;

-- Reuse the established copy behavior, excluding arrangements marked deleted.
create or replace function public.admin_copy_trip_bus_setup(
  p_source_trip_id int8,
  p_name text
)
returns public.trips
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id int8;
  copied_family_id int8;
  created_trip public.trips;
  leader_assignment public.trip_participants;
  leader_profile_id int8;
  saved_assignment public.trip_participants;
  source_assignment record;
  source_bus record;
  source_bus_ids int8[] := '{}'::int8[];
  target_bus_id int8;
  target_bus_ids int8[] := '{}'::int8[];
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(2026090600);

  if not exists (
    select 1
    from public.trips as trips
    where trips.id = p_source_trip_id
      and trips.archived_at is not null
      and trips.bus_setup_deleted_at is null
  ) then
    raise exception 'Closed source trip not found.' using errcode = 'P0002';
  end if;

  select profiles.id
  into actor_profile_id
  from public.profiles as profiles
  where profiles.user_id = (select auth.uid());

  insert into public.trips (name, created_by_profile_id)
  values (btrim(p_name), actor_profile_id)
  returning * into created_trip;

  for source_bus in
    select buses.*
    from public.trip_buses as buses
    where buses.trip_id = p_source_trip_id
    order by buses.sort_order, buses.id
  loop
    insert into public.trip_buses (trip_id, name, sort_order)
    values (created_trip.id, source_bus.name, source_bus.sort_order)
    returning id into target_bus_id;

    source_bus_ids := array_append(source_bus_ids, source_bus.id);
    target_bus_ids := array_append(target_bus_ids, target_bus_id);
  end loop;

  for source_assignment in
    select distinct on (participants.profile_id)
      participants.assignment_family_id,
      participants.bus_id,
      participants.profile_id
    from public.trip_participants as participants
    where participants.trip_id = p_source_trip_id
      and participants.profile_id is not null
      and participants.bus_id is not null
    order by
      participants.profile_id,
      participants.updated_at desc,
      participants.id desc
  loop
    target_bus_id := target_bus_ids[array_position(source_bus_ids, source_assignment.bus_id)];
    if target_bus_id is null then
      continue;
    end if;

    select case
      when profiles.family_id = source_assignment.assignment_family_id
        then source_assignment.assignment_family_id
      else null
    end
    into copied_family_id
    from public.profiles as profiles
    where profiles.id = source_assignment.profile_id;

    select *
    into saved_assignment
    from public.ensure_trip_profile_bus_assignment(
      created_trip.id,
      target_bus_id,
      source_assignment.profile_id,
      copied_family_id
    );
  end loop;

  for source_bus in
    select buses.*
    from public.trip_buses as buses
    where buses.trip_id = p_source_trip_id
      and buses.leader_participant_id is not null
    order by buses.sort_order, buses.id
  loop
    select participants.profile_id
    into leader_profile_id
    from public.trip_participants as participants
    where participants.id = source_bus.leader_participant_id;

    if leader_profile_id is null then
      continue;
    end if;

    target_bus_id := target_bus_ids[array_position(source_bus_ids, source_bus.id)];

    select participants.assignment_family_id
    into copied_family_id
    from public.trip_participants as participants
    where participants.trip_id = created_trip.id
      and participants.profile_id = leader_profile_id
    order by participants.updated_at desc, participants.id desc
    limit 1;

    select *
    into leader_assignment
    from public.ensure_trip_profile_bus_assignment(
      created_trip.id,
      target_bus_id,
      leader_profile_id,
      copied_family_id
    );

    update public.trip_buses as buses
    set leader_participant_id = leader_assignment.id
    where buses.id = target_bus_id;
  end loop;

  return created_trip;
exception
  when unique_violation then
    raise exception 'An active trip already exists or the trip name is invalid.'
      using errcode = '23505';
end;
$$;

revoke all on function public.admin_copy_trip_bus_setup(bigint, text) from public, anon;
grant execute on function public.admin_copy_trip_bus_setup(bigint, text) to authenticated;

notify pgrst, 'reload schema';
commit;
