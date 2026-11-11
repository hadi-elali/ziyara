-- Preparing buses and releasing self-service selection are separate admin steps.
begin;

alter table public.trips add column bus_selection_started_at timestamptz;
comment on column public.trips.bus_selection_started_at is
  'Null while buses are prepared; set once by an admin to release self-service selection and its notification.';

-- Preserve selections that were already available before this change. Do not
-- create notification events or refill historical audiences during migration.
update public.trips as trips set bus_selection_started_at = now()
where exists (select 1 from public.trip_buses where trip_id = trips.id);

drop trigger prepare_bus_selection_notification on public.trip_buses;
create or replace function public.prepare_bus_selection_notification()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.archived_at is not null or new.bus_selection_started_at is null
    or old.bus_selection_started_at is not null then return new; end if;

  insert into public.bus_selection_notifications(trip_id) values (new.id)
    on conflict (trip_id) do nothing;
  if not found then return new; end if;

  -- Preserve an empty audience; later devices are never backfilled.
  insert into public.bus_selection_push_attempts(trip_id, device_id, recipient_profile_id)
    select new.id, d.id, d.profile_id from public.push_notification_devices d;
  return new;
end;
$$;
revoke all on function public.prepare_bus_selection_notification() from public, anon, authenticated;
create trigger prepare_bus_selection_notification
  after update of bus_selection_started_at on public.trips
  for each row execute function public.prepare_bus_selection_notification();

create function public.admin_start_trip_bus_selection(p_trip_id bigint)
returns public.trips
language plpgsql security definer set search_path = '' as $$
declare target public.trips;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  -- Match bus creation, copying, assignments and archival lock order.
  perform pg_advisory_xact_lock(2026090600);
  select * into target from public.trips
  where id = p_trip_id and archived_at is null for update;
  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.trip_buses where trip_id = target.id) then
    raise exception 'Create at least one bus before starting selection.' using errcode = '55000';
  end if;
  if target.bus_selection_started_at is null then
    update public.trips set bus_selection_started_at = now()
    where id = target.id returning * into target;
  end if;
  return target;
end;
$$;
revoke all on function public.admin_start_trip_bus_selection(bigint) from public, anon;
grant execute on function public.admin_start_trip_bus_selection(bigint) to authenticated;

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
  perform pg_advisory_xact_lock(2026090600);
  perform 1 from public.trips
  where id = p_trip_id and archived_at is null for update;
  if not found then
    raise exception 'Active trip not found.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.trips where id = p_trip_id and bus_selection_started_at is not null
  ) then
    raise exception 'Bus selection has not started.' using errcode = '55000';
  end if;
  return public.move_trip_profile_to_bus(p_trip_id, p_bus_id, own_profile_id);
end;
$$;

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
  if not exists (
    select 1 from public.trips where id = p_trip_id and bus_selection_started_at is not null
  ) then
    raise exception 'Bus selection has not started.' using errcode = '55000';
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

create or replace function public.claim_bus_selection_notifications(p_trip_id bigint, p_requester_user_id uuid)
returns table(attempt_id bigint, expo_push_token text, title text, body text)
language plpgsql security definer set search_path = '' as $$
declare target public.trips;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_requester_user_id and role = 'admin'
  ) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Archive and claim cannot race past each other.
  select * into target from public.trips where id = p_trip_id for share;
  if not found then
    raise exception 'Trip not found.' using errcode = 'P0002';
  end if;
  if target.archived_at is not null or target.bus_selection_started_at is null or not exists (
    select 1 from public.trip_buses where trip_id = target.id
  ) then return; end if;

  update public.bus_selection_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'device_unregistered'
    where a.trip_id = target.id and a.claimed_at is null and not exists (
      select 1 from public.push_notification_devices d
      where d.id = a.device_id and d.profile_id = a.recipient_profile_id
    );

  return query
    with batch as (
      select a.id from public.bus_selection_push_attempts a
      where a.trip_id = target.id and a.claimed_at is null
      order by a.id limit 100 for update skip locked
    ), claimed as (
      update public.bus_selection_push_attempts a set claimed_at = now()
      from batch where a.id = batch.id returning a.id, a.device_id
    )
    select c.id, d.expo_push_token,
      case d.locale
        when 'en' then 'Who is on which bus?'
        when 'ar' then 'من في أي حافلة؟'
        else 'Wer ist in welchem Bus?'
      end,
      case d.locale
        when 'en' then 'Bus selection is now available. Please choose your bus and confirm whether you are on board.'
        when 'ar' then 'اختيار الحافلة متاح الآن. يرجى اختيار حافلتك وتأكيد ما إذا كنت على متنها.'
        else 'Die Buswahl ist jetzt freigeschaltet. Bitte wähle deinen Bus und bestätige, ob du schon im Bus bist.'
      end
    from claimed c join public.push_notification_devices d on d.id = c.device_id order by c.id;
end;
$$;
revoke all on function public.claim_bus_selection_notifications(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_bus_selection_notifications(bigint, uuid) to service_role;

comment on table public.bus_selection_notifications is
  'One-time admin release events for bus selection; no historical backfill.';
notify pgrst, 'reload schema';
commit;
