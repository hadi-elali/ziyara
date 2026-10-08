-- Preserve existing calls and allow several independently scheduled/active calls.
alter table public.wake_up_calls
  add column scheduled_for timestamptz not null default now(),
  add column activated_at timestamptz;
update public.wake_up_calls set scheduled_for = created_at, activated_at = created_at;
drop index public.one_active_wake_up_call;
create index wake_up_calls_due_idx on public.wake_up_calls(scheduled_for)
  where closed_at is null and activated_at is null;

create or replace function public.admin_start_wake_up_call(p_message text)
returns public.wake_up_calls language plpgsql security definer set search_path = '' as $$
declare saved public.wake_up_calls;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  insert into public.wake_up_calls(message, created_by_user_id, scheduled_for, activated_at)
    values(btrim(p_message), auth.uid(), now(), now()) returning * into saved;
  insert into public.wake_up_call_recipients(call_id, user_id) select saved.id, user_id from public.profiles;
  return saved;
end;
$$;

create function public.admin_schedule_wake_up_call(p_message text, p_scheduled_for timestamptz, p_call_id bigint default null)
returns public.wake_up_calls language plpgsql security definer set search_path = '' as $$
declare saved public.wake_up_calls;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  if p_scheduled_for is null or p_scheduled_for <= now() or p_scheduled_for > now() + interval '1 year' then
    raise exception 'Choose a future time within the next year.' using errcode = '22023';
  end if;
  if p_call_id is null then
    insert into public.wake_up_calls(message, created_by_user_id, scheduled_for)
      values(btrim(p_message), auth.uid(), p_scheduled_for) returning * into saved;
  else
    update public.wake_up_calls set message = btrim(p_message), scheduled_for = p_scheduled_for
      where id = p_call_id and activated_at is null and closed_at is null and scheduled_for > now()
      returning * into saved;
    if not found then raise exception 'Editable scheduled wake-up call not found.' using errcode = 'P0002'; end if;
  end if;
  -- Recipients are materialized at activation, including people who register meanwhile.
  return saved;
end;
$$;
revoke all on function public.admin_schedule_wake_up_call(text, timestamptz, bigint) from public, anon;
grant execute on function public.admin_schedule_wake_up_call(text, timestamptz, bigint) to authenticated;

create or replace function public.acknowledge_wake_up_call(p_call_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.wake_up_calls where id = p_call_id and closed_at is null
    and activated_at is not null and scheduled_for <= now() for update;
  if not found then raise exception 'Active wake-up call not found.' using errcode = 'P0002'; end if;
  update public.wake_up_call_recipients set acknowledged_at = coalesce(acknowledged_at, now())
    where call_id = p_call_id and user_id = (select auth.uid());
  if not found then raise exception 'Recipient not found.' using errcode = '42501'; end if;
end;
$$;

drop policy wake_up_calls_read on public.wake_up_calls;
create policy wake_up_calls_read on public.wake_up_calls for select to authenticated using (
  (select public.is_admin()) or (
    activated_at is not null and scheduled_for <= now() and
    exists(select 1 from public.wake_up_call_recipients where call_id = id and user_id = (select auth.uid()))
  )
);

-- Called only after server-side scheduler/admin authentication. A row lock orders
-- activation against rescheduling/cancellation; concurrent dispatchers skip it.
create function public.claim_due_wake_up_notifications(p_call_id bigint default null)
returns table(attempt_id bigint, call_id bigint, expo_push_token text, locale text, message text)
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
    insert into public.wake_up_call_recipients(call_id, user_id) select due_id, p.user_id from public.profiles p;
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
  ) select a.id, a.call_id, d.expo_push_token, d.locale, c.message from claimed a
    join public.push_notification_devices d on d.id = a.device_id
    join public.wake_up_calls c on c.id = a.call_id;
end;
$$;
revoke all on function public.claim_due_wake_up_notifications(bigint) from public, anon, authenticated;
grant execute on function public.claim_due_wake_up_notifications(bigint) to service_role;

-- Preserve the immediate-dispatch interface for already installed clients.
create or replace function public.claim_wake_up_notifications(p_call_id bigint, p_requester_user_id uuid)
returns table(attempt_id bigint, expo_push_token text, locale text, message text)
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where user_id = p_requester_user_id and role = 'admin') then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  return query select c.attempt_id, c.expo_push_token, c.locale, c.message
    from public.claim_due_wake_up_notifications(p_call_id) c;
end;
$$;
notify pgrst, 'reload schema';
