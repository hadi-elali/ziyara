begin;

alter table public.trip_participants add column is_on_bus boolean;
comment on column public.trip_participants.is_on_bus is
  'Own-account confirmation for the assigned bus: true aboard, false not aboard, null unanswered. Reset on bus changes.';

create or replace function public.reset_presence_on_bus_change()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.bus_id is distinct from old.bus_id then
    new.is_on_bus := null;
  end if;
  return new;
end;
$$;
revoke all on function public.reset_presence_on_bus_change() from public, anon, authenticated;
create trigger reset_presence_on_bus_change
before update of bus_id on public.trip_participants
for each row execute function public.reset_presence_on_bus_change();

create or replace function public.set_trip_bus_presence(
  p_trip_id bigint, p_bus_id bigint, p_is_on_bus boolean
)
returns public.trip_participants
language plpgsql security definer set search_path = ''
as $$
declare
  own_profile_id bigint;
  saved_assignment public.trip_participants;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_is_on_bus is null then
    raise exception 'Choose whether you are on the bus.' using errcode = '22023';
  end if;
  select id into own_profile_id from public.profiles where user_id = (select auth.uid());
  if own_profile_id is null then
    raise exception 'User profile is required.' using errcode = '42501';
  end if;

  -- Serialize with every assignment API and with trip archival. The expected bus
  -- prevents a delayed confirmation from applying to a different assignment.
  perform pg_advisory_xact_lock(2026090600);
  perform 1 from public.trips
  where id = p_trip_id and archived_at is null for update;
  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;
  select * into saved_assignment from public.trip_participants
  where trip_id = p_trip_id and profile_id = own_profile_id
  order by updated_at desc, id desc limit 1 for update;
  if saved_assignment.id is null or saved_assignment.bus_id is null then
    raise exception 'Choose a bus before confirming your presence.' using errcode = '55000';
  end if;
  if p_bus_id is distinct from saved_assignment.bus_id then
    raise exception 'Your bus assignment has changed.' using errcode = '55000';
  end if;
  update public.trip_participants set is_on_bus = p_is_on_bus
  where id = saved_assignment.id returning * into saved_assignment;
  return saved_assignment;
end;
$$;
revoke all on function public.set_trip_bus_presence(bigint, bigint, boolean) from public, anon;
grant execute on function public.set_trip_bus_presence(bigint, bigint, boolean) to authenticated;

-- PostgreSQL requires dropping a table-returning function when adding a result column.
drop function public.admin_trip_bus_roster(bigint);
create function public.admin_trip_bus_roster(p_trip_id bigint)
returns table (user_id uuid, display_name text, bus_id bigint, participant_id bigint, is_on_bus boolean)
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
  select profiles.user_id, profiles.display_name, assignment.bus_id, assignment.id, assignment.is_on_bus
  from public.profiles as profiles
  left join lateral (
    select participants.id, participants.bus_id, participants.is_on_bus
    from public.trip_participants as participants
    where participants.trip_id = p_trip_id and participants.profile_id = profiles.id
    order by participants.updated_at desc, participants.id desc limit 1
  ) as assignment on true
  order by profiles.display_name, profiles.id;
end;
$$;
revoke all on function public.admin_trip_bus_roster(bigint) from public, anon;
grant execute on function public.admin_trip_bus_roster(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
