-- Moderation history is private to guarded admin RPCs. No profile write grant is added.
create table public.emergency_send_restrictions (
  id bigint generated always as identity primary key,
  profile_id bigint not null references public.profiles(id) on delete cascade,
  restricted_until timestamptz not null,
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  created_at timestamptz not null default clock_timestamp(),
  created_by_profile_id bigint references public.profiles(id) on delete set null,
  created_by_display_name text not null,
  revoked_at timestamptz,
  revoked_by_profile_id bigint references public.profiles(id) on delete set null,
  revoked_by_display_name text,
  check (restricted_until > created_at)
);
create unique index emergency_send_restrictions_current_idx
  on public.emergency_send_restrictions(profile_id) where revoked_at is null;
alter table public.emergency_send_restrictions enable row level security;
revoke all on public.emergency_send_restrictions from public, anon, authenticated;
revoke all on sequence public.emergency_send_restrictions_id_seq from public, anon, authenticated;

-- Exactly one target: a user from the admin list, or the sender of an emergency.
create function public.resolve_emergency_restriction_profile(p_user_id uuid, p_request_id bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare target_id bigint;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if (p_user_id is null) = (p_request_id is null) then
    raise exception 'Exactly one emergency restriction target is required.' using errcode = '22023';
  end if;
  if p_user_id is not null then
    select id into target_id from public.profiles where user_id = p_user_id;
  else
    select requester_profile_id into target_id from public.emergency_requests where id = p_request_id;
  end if;
  if target_id is null then
    raise exception 'Emergency restriction target not found.' using errcode = 'P0002';
  end if;
  return target_id;
end;
$$;
revoke all on function public.resolve_emergency_restriction_profile(uuid, bigint) from public, anon, authenticated;

create function public.admin_get_emergency_send_restriction(
  p_user_id uuid default null, p_request_id bigint default null
)
returns table(id bigint, restricted_until timestamptz, reason text, created_at timestamptz, created_by_display_name text)
language plpgsql security definer set search_path = '' as $$
declare target_id bigint;
begin
  target_id := public.resolve_emergency_restriction_profile(p_user_id, p_request_id);
  return query select r.id, r.restricted_until, r.reason, r.created_at, r.created_by_display_name
    from public.emergency_send_restrictions r
    where r.profile_id = target_id and r.revoked_at is null and r.restricted_until > clock_timestamp();
end;
$$;

create function public.admin_restrict_emergency_sender(
  p_duration_hours integer, p_reason text, p_user_id uuid default null, p_request_id bigint default null
)
returns table(id bigint, restricted_until timestamptz, reason text, created_at timestamptz, created_by_display_name text)
language plpgsql security definer set search_path = '' as $$
declare target_id bigint; actor_id bigint; actor_name text; changed_at timestamptz;
begin
  target_id := public.resolve_emergency_restriction_profile(p_user_id, p_request_id);
  if p_duration_hours is null or p_duration_hours not in (1, 24) then
    raise exception 'Choose a restriction of 1 or 24 hours.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500 then
    raise exception 'A restriction reason of 5 to 500 characters is required.' using errcode = '22023';
  end if;
  -- The insert guard and revocation acquire this same lock, ordering concurrent sends.
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
  -- Close expired history before recording a new finite restriction.
  update public.emergency_send_restrictions r set revoked_at = changed_at,
    revoked_by_profile_id = actor_id, revoked_by_display_name = actor_name
    where r.profile_id = target_id and r.revoked_at is null;
  return query insert into public.emergency_send_restrictions as r
    (profile_id, restricted_until, reason, created_at, created_by_profile_id, created_by_display_name)
    values(target_id, changed_at + make_interval(hours => p_duration_hours), btrim(p_reason), changed_at, actor_id, actor_name)
    returning r.id, r.restricted_until, r.reason, r.created_at, r.created_by_display_name;
end;
$$;

create function public.admin_revoke_emergency_send_restriction(
  p_restriction_id bigint, p_user_id uuid default null, p_request_id bigint default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare target_id bigint; actor_id bigint; actor_name text;
begin
  target_id := public.resolve_emergency_restriction_profile(p_user_id, p_request_id);
  perform 1 from public.profiles where id = target_id for update;
  select id, display_name into actor_id, actor_name from public.profiles where user_id = (select auth.uid()) and role = 'admin';
  if actor_id is null then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  -- An outdated admin screen must never revoke a newer restriction.
  update public.emergency_send_restrictions r
    set revoked_at = clock_timestamp(), revoked_by_profile_id = actor_id, revoked_by_display_name = actor_name
    where r.id = p_restriction_id and r.profile_id = target_id and r.revoked_at is null;
  if not found then
    raise exception 'Emergency send restriction has changed. Refresh and try again.' using errcode = '40001';
  end if;
end;
$$;

create function public.get_my_emergency_send_restriction()
returns timestamptz language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  -- Never expose moderation reasons, other accounts, or admin identities to senders.
  return (select r.restricted_until from public.emergency_send_restrictions r
    join public.profiles p on p.id = r.profile_id
    where p.user_id = (select auth.uid()) and r.revoked_at is null and r.restricted_until > clock_timestamp());
end;
$$;

create function public.enforce_emergency_send_restriction()
returns trigger language plpgsql security definer set search_path = '' as $$
declare blocked_until timestamptz;
begin
  perform 1 from public.profiles where id = new.requester_profile_id for update;
  select restricted_until into blocked_until from public.emergency_send_restrictions
    where profile_id = new.requester_profile_id and revoked_at is null and restricted_until > clock_timestamp();
  if blocked_until is not null then
    raise exception 'EMERGENCY_SEND_RESTRICTED' using errcode = 'P0001',
      detail = json_build_object('restricted_until', blocked_until)::text;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_emergency_send_restriction() from public, anon, authenticated;
create trigger enforce_emergency_send_restriction before insert on public.emergency_requests
  for each row execute function public.enforce_emergency_send_restriction();

revoke all on function public.admin_get_emergency_send_restriction(uuid, bigint) from public, anon;
revoke all on function public.admin_restrict_emergency_sender(integer, text, uuid, bigint) from public, anon;
revoke all on function public.admin_revoke_emergency_send_restriction(bigint, uuid, bigint) from public, anon;
revoke all on function public.get_my_emergency_send_restriction() from public, anon;
grant execute on function public.admin_get_emergency_send_restriction(uuid, bigint) to authenticated;
grant execute on function public.admin_restrict_emergency_sender(integer, text, uuid, bigint) to authenticated;
grant execute on function public.admin_revoke_emergency_send_restriction(bigint, uuid, bigint) to authenticated;
grant execute on function public.get_my_emergency_send_restriction() to authenticated;

comment on table public.emergency_send_restrictions is
  'Private finite emergency send restrictions with admin reason/actor history; unrelated app access and emergency reception remain available.';
notify pgrst, 'reload schema';
