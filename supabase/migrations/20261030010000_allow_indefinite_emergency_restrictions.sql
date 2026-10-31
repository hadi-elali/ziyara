-- NULL duration explicitly requests manual release. PostgreSQL infinity keeps
-- absence of a restriction (NULL from the own-status RPC) unambiguous and leaves
-- finite restrictions, the insert guard and existing clients' RPC signatures intact.
create or replace function public.admin_restrict_emergency_sender(
  p_duration_hours integer, p_reason text, p_user_id uuid default null, p_request_id bigint default null
)
returns table(id bigint, restricted_until timestamptz, reason text, created_at timestamptz, created_by_display_name text)
language plpgsql security definer set search_path = '' as $$
declare target_id bigint; actor_id bigint; actor_name text; changed_at timestamptz;
begin
  target_id := public.resolve_emergency_restriction_profile(p_user_id, p_request_id);
  if p_duration_hours is not null and p_duration_hours not in (1, 24) then
    raise exception 'Choose 1 hour, 24 hours or manual release.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'A restriction reason of 5 to 500 characters is required.' using errcode = '22023';
  end if;
  perform 1 from public.profiles where profiles.id = target_id for update;
  if not found then
    raise exception 'Emergency restriction target not found.' using errcode = 'P0002';
  end if;
  select profiles.id, profiles.display_name into actor_id, actor_name
    from public.profiles where user_id = (select auth.uid()) and role = 'admin';
  if actor_id is null then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  changed_at := clock_timestamp();
  if exists(select 1 from public.emergency_send_restrictions r
    where r.profile_id = target_id and r.revoked_at is null and r.restricted_until > changed_at) then
    raise exception 'An active emergency send restriction already exists.' using errcode = '55000';
  end if;
  update public.emergency_send_restrictions r set revoked_at = changed_at,
    revoked_by_profile_id = actor_id, revoked_by_display_name = actor_name
    where r.profile_id = target_id and r.revoked_at is null;
  return query insert into public.emergency_send_restrictions as r
    (profile_id, restricted_until, reason, created_at, created_by_profile_id, created_by_display_name)
    values(target_id, case when p_duration_hours is null then 'infinity'::timestamptz
      else changed_at + make_interval(hours => p_duration_hours) end,
      btrim(p_reason), changed_at, actor_id, actor_name)
    returning r.id, r.restricted_until, r.reason, r.created_at, r.created_by_display_name;
end;
$$;

revoke all on function public.admin_restrict_emergency_sender(integer, text, uuid, bigint) from public, anon;
grant execute on function public.admin_restrict_emergency_sender(integer, text, uuid, bigint) to authenticated;
comment on function public.admin_restrict_emergency_sender(integer, text, uuid, bigint) is
  'Admin-only emergency send restriction: 1/24 hours, or NULL duration until explicit manual revocation. A private reason is required.';
comment on table public.emergency_send_restrictions is
  'Private emergency send restriction history with admin reasons and actors. An infinity expiry requires manual revocation.';
notify pgrst, 'reload schema';
