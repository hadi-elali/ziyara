-- Group import also sets the bus leader in the same transaction.
-- Keep the three-argument entry point for older clients with a sole group leader.
create function public.admin_assign_trip_group(
  p_trip_id bigint,
  p_bus_id bigint,
  p_group_id bigint,
  p_leader_user_id uuid
)
returns setof public.trip_participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  group_profile record;
  group_leader_profile_ids bigint[];
  selected_leader_profile_id bigint;
  selected_leader_participant_id bigint;
  member_profile_ids bigint[];
  saved_assignment public.trip_participants;
  saved_assignment_ids bigint[] := '{}';
begin
  if (select auth.uid()) is null or not coalesce((select public.is_admin()), false) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Match existing bus mutations and independent group edits/deletions.
  perform pg_advisory_xact_lock(2026090600);
  perform pg_advisory_xact_lock(20261008, 1);

  -- Boarding creation and trip archival also lock this row. Neither can cross
  -- the membership snapshot and assignment writes below.
  perform 1 from public.trips
  where id = p_trip_id and archived_at is null
  for update;
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

  if not exists (select 1 from public.organization_groups where id = p_group_id) then
    raise exception 'Group not found.' using errcode = 'P0002';
  end if;

  -- Lock registered profiles so a concurrent account deletion cannot produce
  -- a partially resolved group. Leadership is already included in membership.
  perform profiles.id
  from public.profiles as profiles
  join public.organization_group_members as members on members.user_id = profiles.user_id
  where members.group_id = p_group_id
  order by profiles.id
  for update of profiles;

  select array_agg(profiles.id order by profiles.id)
  into member_profile_ids
  from public.profiles as profiles
  join public.organization_group_members as members on members.user_id = profiles.user_id
  where members.group_id = p_group_id;

  if coalesce(cardinality(member_profile_ids), 0) = 0 then
    raise exception 'The selected group has no accounts.' using errcode = '22023';
  end if;

  select array_agg(profiles.id order by profiles.id)
  into group_leader_profile_ids
  from public.profiles as profiles
  join public.organization_group_members as members on members.user_id = profiles.user_id
  where members.group_id = p_group_id and members.is_leader;

  if coalesce(cardinality(group_leader_profile_ids), 0) = 0 then
    raise exception 'The selected group has no leader.' using errcode = '22023';
  end if;

  if p_leader_user_id is null then
    if cardinality(group_leader_profile_ids) <> 1 then
      raise exception 'Select a group leader to lead the bus.' using errcode = '22023';
    end if;
    selected_leader_profile_id := group_leader_profile_ids[1];
  else
    select profiles.id into selected_leader_profile_id
    from public.profiles as profiles
    where profiles.user_id = p_leader_user_id and profiles.id = any(group_leader_profile_ids);
    if selected_leader_profile_id is null then
      raise exception 'Selected group leader not found.' using errcode = '22023';
    end if;
  end if;

  if exists (
    select 1 from public.trip_buses as buses
    join public.trip_participants as leaders on leaders.id = buses.leader_participant_id
    where buses.trip_id = p_trip_id and buses.id <> p_bus_id
      and leaders.profile_id = any(member_profile_ids)
  ) then
    raise exception 'A group member leads another bus.' using errcode = '55000';
  end if;

  -- Keep existing family assignment units together. Group membership can have
  -- changed independently since a family was assigned to this trip.
  if exists (
    select 1 from public.trip_participants as outside_member
    where outside_member.trip_id = p_trip_id
      and outside_member.bus_id is distinct from p_bus_id
      and (outside_member.profile_id is null or not (outside_member.profile_id = any(member_profile_ids)))
      and outside_member.assignment_family_id in (
        select member.assignment_family_id from public.trip_participants as member
        where member.trip_id = p_trip_id and member.profile_id = any(member_profile_ids)
      )
  ) then
    raise exception 'The group would split an existing family bus assignment.' using errcode = '55000';
  end if;

  for group_profile in
    select profiles.id,
      (select participants.assignment_family_id from public.trip_participants as participants
       where participants.trip_id = p_trip_id and participants.profile_id = profiles.id
       order by participants.updated_at desc, participants.id desc limit 1) as family_id
    from public.profiles as profiles
    where profiles.id = any(member_profile_ids)
    order by profiles.id
  loop
    select * into saved_assignment
    from public.ensure_trip_profile_bus_assignment(p_trip_id, p_bus_id, group_profile.id, group_profile.family_id);
    saved_assignment_ids := array_append(saved_assignment_ids, saved_assignment.id);
    if group_profile.id = selected_leader_profile_id then
      selected_leader_participant_id := saved_assignment.id;
    end if;
  end loop;

  -- Replacing the target bus leader leaves the former leader's assignment intact.
  update public.trip_buses set leader_participant_id = selected_leader_participant_id
  where id = p_bus_id and trip_id = p_trip_id;

  return query select participants.* from public.trip_participants as participants
  where participants.id = any(saved_assignment_ids)
  order by participants.display_name, participants.id;
end;
$$;

revoke all on function public.admin_assign_trip_group(bigint, bigint, bigint, uuid) from public, anon, authenticated;
grant execute on function public.admin_assign_trip_group(bigint, bigint, bigint, uuid) to authenticated;

-- No default on the new overload: PostgREST can resolve both signatures unambiguously.
create or replace function public.admin_assign_trip_group(
  p_trip_id bigint,
  p_bus_id bigint,
  p_group_id bigint
)
returns setof public.trip_participants
language sql
security definer
set search_path = ''
as $$
  select * from public.admin_assign_trip_group(p_trip_id, p_bus_id, p_group_id, null::uuid);
$$;
revoke all on function public.admin_assign_trip_group(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.admin_assign_trip_group(bigint, bigint, bigint) to authenticated;
