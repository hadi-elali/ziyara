-- Snapshot only the addressed leader's registered devices when a new request is saved.
-- Existing requests are deliberately not backfilled.
create table public.group_location_push_attempts (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.organization_group_location_requests(id) on delete cascade,
  device_id bigint references public.push_notification_devices(id) on delete set null,
  recipient_profile_id bigint references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  accepted boolean,
  error_code text check (error_code is null or error_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  expo_http_status integer check (expo_http_status between 100 and 599),
  expo_ticket_id uuid,
  unique(request_id, device_id)
);
create index group_location_push_attempts_request_idx
  on public.group_location_push_attempts(request_id);
alter table public.group_location_push_attempts enable row level security;
revoke all on public.group_location_push_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.group_location_push_attempts to service_role;
grant usage, select on sequence public.group_location_push_attempts_id_seq to service_role;

create function public.prepare_group_location_notification()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' then
    insert into public.group_location_push_attempts(request_id, device_id, recipient_profile_id)
      select new.id, d.id, d.profile_id
      from public.push_notification_devices d
      join public.profiles p on p.id = d.profile_id
      where p.user_id = new.leader_user_id;
  end if;
  return new;
end;
$$;
revoke all on function public.prepare_group_location_notification() from public, anon, authenticated;
create trigger prepare_group_location_notification
  after insert on public.organization_group_location_requests
  for each row execute function public.prepare_group_location_notification();

create function public.claim_group_location_notifications(p_request_id bigint, p_requester_user_id uuid)
returns table(attempt_id bigint, expo_push_token text, title text, body text)
language plpgsql security definer set search_path = '' as $$
declare target public.organization_group_location_requests;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_requester_user_id and role = 'admin'
  ) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Use the same lock as request replacement, response and membership changes.
  perform pg_advisory_xact_lock(20261008, 1);
  select * into target from public.organization_group_location_requests where id = p_request_id;
  -- A replaced/deleted request is a successful no-op, never a new notification.
  if not found or target.status <> 'pending' or not exists (
    select 1 from public.organization_group_members m
    where m.group_id = target.group_id and m.user_id = target.leader_user_id and m.is_leader
  ) then return; end if;

  update public.group_location_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'device_unregistered'
    where a.request_id = target.id and a.claimed_at is null and not exists (
      select 1 from public.push_notification_devices d
      join public.profiles p on p.id = d.profile_id
      where d.id = a.device_id and d.profile_id = a.recipient_profile_id
        and p.user_id = target.leader_user_id
    );

  return query
    with batch as (
      select a.id from public.group_location_push_attempts a
      where a.request_id = target.id and a.claimed_at is null
      order by a.id limit 100 for update skip locked
    ), claimed as (
      update public.group_location_push_attempts a set claimed_at = now()
      from batch where a.id = batch.id returning a.id, a.device_id
    )
    select c.id, d.expo_push_token,
      case d.locale
        when 'en' then 'Location requested'
        when 'ar' then 'طلب مشاركة الموقع'
        else 'Standort angefragt'
      end,
      case d.locale
        when 'en' then 'The travel team asks you to share your location once. Open your group to accept or decline.'
        when 'ar' then 'يطلب منك فريق الرحلة مشاركة موقعك مرة واحدة. افتح مجموعتك للموافقة أو الرفض.'
        else 'Das Reiseteam bittet dich, deinen Standort einmalig zu teilen. Öffne deine Gruppe, um zuzustimmen oder abzulehnen.'
      end
    from claimed c join public.push_notification_devices d on d.id = c.device_id order by c.id;
end;
$$;
revoke all on function public.claim_group_location_notifications(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_group_location_notifications(bigint, uuid) to service_role;

comment on table public.group_location_push_attempts is
  'Private addressed-leader device snapshot and one-time claims for consent-based location requests. No coordinates or tokens stored.';

notify pgrst, 'reload schema';
