-- Clear only the leadership role, keeping the person's bus/family assignment
-- and presence response intact.
begin;

create or replace function public.admin_remove_trip_bus_leader(p_bus_id bigint)
returns public.trip_buses
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_bus public.trip_buses;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Serialize with leader changes and person/family/group moves. Lock the trip
  -- as well so leadership cannot be removed after concurrent archival.
  perform pg_advisory_xact_lock(2026090600);

  select buses.* into saved_bus
  from public.trip_buses as buses
  join public.trips as trips on trips.id = buses.trip_id
  where buses.id = p_bus_id and trips.archived_at is null
  for update of trips, buses;

  if saved_bus.id is null then
    raise exception 'Bus in active trip not found.' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.bus_boardings
    where trip_id = saved_bus.trip_id and closed_at is null
  ) then
    raise exception 'Close the active boarding before changing the bus leader.'
      using errcode = '55000';
  end if;

  update public.trip_buses as buses
  set leader_participant_id = null
  where buses.id = saved_bus.id
  returning buses.* into saved_bus;

  return saved_bus;
end;
$$;

revoke all on function public.admin_remove_trip_bus_leader(bigint) from public, anon;
grant execute on function public.admin_remove_trip_bus_leader(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
