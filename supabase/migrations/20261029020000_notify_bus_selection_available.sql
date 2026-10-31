-- Capture one audience when an active trip first becomes selectable.
-- Existing trips with buses are intentionally not backfilled.
create table public.bus_selection_notifications (
  trip_id bigint primary key references public.trips(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.bus_selection_push_attempts (
  id bigint generated always as identity primary key,
  trip_id bigint not null references public.bus_selection_notifications(trip_id) on delete cascade,
  device_id bigint references public.push_notification_devices(id) on delete set null,
  recipient_profile_id bigint references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  accepted boolean,
  error_code text check (error_code is null or error_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  expo_http_status integer check (expo_http_status between 100 and 599),
  expo_ticket_id uuid,
  unique(trip_id, device_id)
);
create index bus_selection_push_attempts_trip_idx
  on public.bus_selection_push_attempts(trip_id);
alter table public.bus_selection_notifications enable row level security;
alter table public.bus_selection_push_attempts enable row level security;
revoke all on public.bus_selection_notifications, public.bus_selection_push_attempts
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.bus_selection_notifications, public.bus_selection_push_attempts to service_role;
grant usage, select on sequence public.bus_selection_push_attempts_id_seq to service_role;

create function public.prepare_bus_selection_notification()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Bus creation/copying already locks the trip; also serialize direct inserts.
  perform 1 from public.trips where id = new.trip_id and archived_at is null for update;
  if not found then return new; end if;
  if exists (
    select 1 from public.trip_buses where trip_id = new.trip_id and id <> new.id
  ) then return new; end if;

  insert into public.bus_selection_notifications(trip_id) values (new.trip_id)
    on conflict (trip_id) do nothing;
  if not found then return new; end if;

  -- A separate event row preserves an empty audience without later backfilling.
  insert into public.bus_selection_push_attempts(trip_id, device_id, recipient_profile_id)
    select new.trip_id, d.id, d.profile_id from public.push_notification_devices d;
  return new;
end;
$$;
revoke all on function public.prepare_bus_selection_notification() from public, anon, authenticated;
create trigger prepare_bus_selection_notification
  after insert on public.trip_buses
  for each row execute function public.prepare_bus_selection_notification();

create function public.claim_bus_selection_notifications(p_trip_id bigint, p_requester_user_id uuid)
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
  if target.archived_at is not null or not exists (
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
  'One-time activation events when an active trip receives its first bus; no historical backfill.';
comment on table public.bus_selection_push_attempts is
  'Private registered-device snapshot and one-time claims for bus selection activation.';

notify pgrst, 'reload schema';
