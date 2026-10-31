-- Android channel behavior cannot be changed after creation. Remember which
-- channel each installation actually created; older clients must keep using v1.
alter table public.push_notification_devices
  add column wake_up_channel_id text not null default 'wake-up-calls-v1'
    check (wake_up_channel_id in ('wake-up-calls-v1', 'wake-up-calls-v2'));

comment on column public.push_notification_devices.wake_up_channel_id is
  'Installed wake-up notification channel advertised by this device; v1 for legacy clients and iOS.';

-- Preserve the old signature and reset the capability when an older client
-- registers again. The four-argument overload below upgrades it atomically.
create or replace function public.register_push_notification_device(
  p_expo_push_token text,
  p_platform text,
  p_locale text
)
returns void
language plpgsql security definer set search_path = '' as $$
declare actor_profile_id int8;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select p.id into actor_profile_id from public.profiles p
    where p.user_id = (select auth.uid());
  if actor_profile_id is null then
    raise exception 'A user profile is required.' using errcode = '42501';
  end if;

  insert into public.push_notification_devices (
    profile_id, expo_push_token, platform, locale, wake_up_channel_id
  ) values (
    actor_profile_id, btrim(p_expo_push_token), lower(btrim(p_platform)),
    lower(btrim(p_locale)), 'wake-up-calls-v1'
  )
  on conflict (expo_push_token) do update set
    profile_id = excluded.profile_id,
    platform = excluded.platform,
    locale = excluded.locale,
    wake_up_channel_id = excluded.wake_up_channel_id;
end;
$$;

create function public.register_push_notification_device(
  p_expo_push_token text,
  p_platform text,
  p_locale text,
  p_wake_up_channel_id text
)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_wake_up_channel_id is null
    or p_wake_up_channel_id not in ('wake-up-calls-v1', 'wake-up-calls-v2')
    or (p_wake_up_channel_id = 'wake-up-calls-v2'
      and lower(btrim(p_platform)) is distinct from 'android') then
    raise exception 'Invalid wake-up notification channel.' using errcode = '22023';
  end if;
  perform public.register_push_notification_device(p_expo_push_token, p_platform, p_locale);
  update public.push_notification_devices d
    set wake_up_channel_id = p_wake_up_channel_id
    where d.expo_push_token = btrim(p_expo_push_token)
      and d.profile_id = (
        select p.id from public.profiles p where p.user_id = (select auth.uid())
      );
end;
$$;

revoke all on function public.register_push_notification_device(text, text, text) from public, anon;
revoke all on function public.register_push_notification_device(text, text, text, text) from public, anon;
grant execute on function public.register_push_notification_device(text, text, text) to authenticated;
grant execute on function public.register_push_notification_device(text, text, text, text) to authenticated;

-- Only the privileged claim result gains a column. Keep the activation,
-- recipient snapshot, 15-minute window and one-attempt-per-device rules intact.
-- The legacy immediate-dispatch wrapper selects named columns and stays valid.
drop function public.claim_due_wake_up_notifications(bigint);
create function public.claim_due_wake_up_notifications(p_call_id bigint default null)
returns table(
  attempt_id bigint, call_id bigint, expo_push_token text, locale text,
  message text, wake_up_channel_id text
)
language plpgsql security definer set search_path = '' as $$
declare due_id bigint;
begin
  for due_id in
    select c.id from public.wake_up_calls c
    where c.closed_at is null and c.activated_at is null and c.scheduled_for <= now()
      and (p_call_id is null or c.id = p_call_id)
    order by c.scheduled_for, c.id for update skip locked
  loop
    update public.wake_up_calls set activated_at = now() where id = due_id;
    insert into public.wake_up_call_recipients(call_id, user_id)
      select due_id, p.user_id from public.profiles p;
  end loop;

  return query with claimed as (
    insert into public.wake_up_notification_attempts(call_id, device_id)
    select c.id, d.id from public.wake_up_calls c
    join public.wake_up_call_recipients r on r.call_id = c.id
    join public.profiles p on p.user_id = r.user_id
    join public.push_notification_devices d on d.profile_id = p.id
    where c.closed_at is null and c.activated_at is not null and c.scheduled_for <= now()
      and c.activated_at > now() - interval '15 minutes' and r.acknowledged_at is null
      and (p_call_id is null or c.id = p_call_id)
    on conflict do nothing returning id, wake_up_notification_attempts.call_id, device_id
  ) select a.id, a.call_id, d.expo_push_token, d.locale, c.message, d.wake_up_channel_id
    from claimed a
    join public.push_notification_devices d on d.id = a.device_id
    join public.wake_up_calls c on c.id = a.call_id;
end;
$$;
revoke all on function public.claim_due_wake_up_notifications(bigint) from public, anon, authenticated;
grant execute on function public.claim_due_wake_up_notifications(bigint) to service_role;

notify pgrst, 'reload schema';
