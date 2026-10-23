-- General organizational messages; independent of wake-up calls and trips.
create table public.admin_push_messages (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_by_profile_id bigint references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz
);

create table public.admin_push_notification_attempts (
  id bigint generated always as identity primary key,
  message_id bigint not null references public.admin_push_messages(id) on delete cascade,
  device_id bigint references public.push_notification_devices(id) on delete set null,
  recipient_profile_id bigint references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  accepted boolean,
  error_code text check (error_code is null or error_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  expo_http_status integer check (expo_http_status between 100 and 599),
  expo_ticket_id uuid,
  unique(message_id, device_id)
);
create index admin_push_attempts_message_idx
  on public.admin_push_notification_attempts(message_id);

alter table public.admin_push_messages enable row level security;
alter table public.admin_push_notification_attempts enable row level security;
revoke all on public.admin_push_messages, public.admin_push_notification_attempts from anon, authenticated;
grant select, insert, update, delete on public.admin_push_messages, public.admin_push_notification_attempts to service_role;
grant usage, select on sequence public.admin_push_messages_id_seq, public.admin_push_notification_attempts_id_seq to service_role;

create function public.admin_prepare_push_message(p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
declare message_id bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  insert into public.admin_push_messages(title, body, created_by_profile_id)
  values (btrim(p_title), btrim(p_body), (select id from public.profiles where user_id = auth.uid()))
  returning id into message_id;
  return message_id;
end;
$$;
revoke all on function public.admin_prepare_push_message(text, text) from public, anon;
grant execute on function public.admin_prepare_push_message(text, text) to authenticated;

-- Only a verified server may claim tokens. Locking the message serializes the
-- first recipient snapshot and concurrent batches. Claimed attempts never retry.
create function public.claim_admin_push_notifications(p_message_id bigint, p_requester_user_id uuid)
returns table(attempt_id bigint, expo_push_token text, title text, body text)
language plpgsql security definer set search_path = public as $$
declare target public.admin_push_messages;
begin
  if not exists(select 1 from public.profiles where user_id = p_requester_user_id and role = 'admin') then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  select * into target from public.admin_push_messages where id = p_message_id for update;
  if not found then raise exception 'Message not found.' using errcode = 'P0002'; end if;
  if target.started_at is null then
    insert into public.admin_push_notification_attempts(message_id, device_id, recipient_profile_id)
      select target.id, d.id, d.profile_id from public.push_notification_devices d;
    update public.admin_push_messages set started_at = now() where id = target.id;
  end if;

  -- Respect devices removed or reassigned since the recipient snapshot. Preserve
  -- totals even after unregistering a device or deleting an account.
  update public.admin_push_notification_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'device_unregistered'
    where a.message_id = target.id and a.claimed_at is null and not exists (
      select 1 from public.push_notification_devices d
      where d.id = a.device_id and d.profile_id = a.recipient_profile_id
    );
  return query
    with batch as (
      select a.id from public.admin_push_notification_attempts a
      where a.message_id = target.id and a.claimed_at is null order by a.id limit 100
    ), claimed as (
      update public.admin_push_notification_attempts a set claimed_at = now()
      from batch where a.id = batch.id returning a.id, a.device_id
    )
    select c.id, d.expo_push_token, target.title, target.body
    from claimed c join public.push_notification_devices d on d.id = c.device_id order by c.id;
end;
$$;
revoke all on function public.claim_admin_push_notifications(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_admin_push_notifications(bigint, uuid) to service_role;

-- Counts only; client access never exposes tokens, device IDs or recipients.
create function public.admin_list_push_messages()
returns table(id bigint, title text, body text, created_at timestamptz, started_at timestamptz,
  total bigint, accepted bigint, failed bigint, pending bigint)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  return query
    select m.id, m.title, m.body, m.created_at, m.started_at,
      count(a.id), count(a.id) filter(where a.accepted = true),
      count(a.id) filter(where a.accepted = false), count(a.id) filter(where a.accepted is null)
    from (select * from public.admin_push_messages order by id desc limit 10) m
    left join public.admin_push_notification_attempts a on a.message_id = m.id
    group by m.id, m.title, m.body, m.created_at, m.started_at order by m.id desc;
end;
$$;
revoke all on function public.admin_list_push_messages() from public, anon;
grant execute on function public.admin_list_push_messages() to authenticated;
