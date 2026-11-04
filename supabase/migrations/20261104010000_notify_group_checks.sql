create table public.group_check_push_attempts (
  id bigint generated always as identity primary key,
  check_id bigint not null references public.group_checks(id) on delete cascade,
  device_id bigint references public.push_notification_devices(id) on delete set null,
  recipient_profile_id bigint references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  accepted boolean,
  error_code text check (error_code is null or error_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  expo_http_status integer check (expo_http_status between 100 and 599),
  expo_ticket_id uuid,
  unique(check_id, device_id)
);
alter table public.group_check_push_attempts enable row level security;
revoke all on public.group_check_push_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.group_check_push_attempts to service_role;
grant usage, select on sequence public.group_check_push_attempts_id_seq to service_role;

create function public.prepare_group_check_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Snapshot once, in the activation transaction, including admin participants.
  -- Existing checks and devices registered later are deliberately not backfilled.
  insert into public.group_check_push_attempts(check_id, device_id, recipient_profile_id)
    select new.id, d.id, d.profile_id from public.push_notification_devices d;
  return new;
end;
$$;
revoke all on function public.prepare_group_check_notification() from public, anon, authenticated;
create trigger prepare_group_check_notification
after insert on public.group_checks
for each row when (new.closed_at is null)
execute function public.prepare_group_check_notification();

create function public.claim_group_check_notifications(p_check_id bigint, p_requester_user_id uuid)
returns table(attempt_id bigint, expo_push_token text, title text, body text)
language plpgsql security definer set search_path = '' as $$
declare target public.group_checks;
begin
  if not exists (
    select 1 from public.profiles where user_id = p_requester_user_id and role = 'admin'
  ) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Serialize each claim against closing this check, using its existing row lock.
  select * into target from public.group_checks where id = p_check_id for share;
  if not found then
    raise exception 'Group check not found.' using errcode = 'P0002';
  end if;
  if target.closed_at is not null then return; end if;

  update public.group_check_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'device_unregistered'
    where a.check_id = target.id and a.claimed_at is null and not exists (
      select 1 from public.push_notification_devices d
      where d.id = a.device_id and d.profile_id = a.recipient_profile_id
    );
  update public.group_check_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'already_answered'
    where a.check_id = target.id and a.claimed_at is null and exists (
      select 1 from public.group_check_responses r
      where r.check_id = target.id and r.profile_id = a.recipient_profile_id
    );

  return query
    with batch as (
      select a.id from public.group_check_push_attempts a
      where a.check_id = target.id and a.claimed_at is null
      order by a.id limit 100 for update skip locked
    ), claimed as (
      update public.group_check_push_attempts a set claimed_at = now()
      from batch where a.id = batch.id returning a.id, a.device_id
    )
    select c.id, d.expo_push_token,
      case d.locale
        when 'en' then 'New status check'
        when 'ar' then 'استطلاع حالة جديد'
        else 'Neue Statusabfrage'
      end,
      case d.locale
        when 'en' then 'The travel team has started a status check. Please open the app and answer.'
        when 'ar' then 'بدأ فريق الرحلة استطلاعًا للحالة. يرجى فتح التطبيق والإجابة.'
        else 'Die Reiseleitung hat eine Statusabfrage gestartet. Bitte öffne die App und antworte.'
      end
    from claimed c join public.push_notification_devices d on d.id = c.device_id order by c.id;
end;
$$;
revoke all on function public.claim_group_check_notifications(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_group_check_notifications(bigint, uuid) to service_role;
comment on table public.group_check_push_attempts is
  'Private activation recipient snapshot and one-time claims. Expo acceptance does not confirm device delivery.';
notify pgrst, 'reload schema';
