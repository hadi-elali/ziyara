-- Existing messages and older clients keep their original all-device behavior.
alter table public.admin_push_messages
  add column audience text not null default 'all'
    check (audience in ('all', 'brother', 'sister'));

create function public.admin_prepare_push_message(p_title text, p_body text, p_audience text)
returns bigint language plpgsql security definer set search_path = public as $$
declare message_id bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_audience is null or p_audience not in ('all', 'brother', 'sister') then
    raise exception 'Choose all, brothers or sisters.' using errcode = '22023';
  end if;
  insert into public.admin_push_messages(title, body, audience, created_by_profile_id)
  values (btrim(p_title), btrim(p_body), p_audience,
    (select id from public.profiles where user_id = auth.uid()))
  returning id into message_id;
  return message_id;
end;
$$;
revoke all on function public.admin_prepare_push_message(text, text, text) from public, anon;
grant execute on function public.admin_prepare_push_message(text, text, text) to authenticated;

-- Preserve the two-argument RPC used by already installed app versions.
create or replace function public.admin_prepare_push_message(p_title text, p_body text)
returns bigint language plpgsql security definer set search_path = public as $$
begin
  return public.admin_prepare_push_message(p_title, p_body, 'all');
end;
$$;
revoke all on function public.admin_prepare_push_message(text, text) from public, anon;
grant execute on function public.admin_prepare_push_message(text, text) to authenticated;

create or replace function public.claim_admin_push_notifications(p_message_id bigint, p_requester_user_id uuid)
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
      select target.id, d.id, d.profile_id from public.push_notification_devices d
      join public.profiles p on p.id = d.profile_id
      where target.audience = 'all' or p.member_type::text = target.audience;
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
  -- Exclude accounts whose assignment changed before their batch was claimed.
  update public.admin_push_notification_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'audience_changed'
    where a.message_id = target.id and a.claimed_at is null and target.audience <> 'all'
      and not exists (
        select 1 from public.profiles p where p.id = a.recipient_profile_id
          and p.member_type::text = target.audience
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

notify pgrst, 'reload schema';
