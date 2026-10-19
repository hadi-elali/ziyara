alter table public.emergency_requests
  add column completed_at timestamptz,
  add column completed_by_profile_id int8 references public.profiles (id) on delete set null;

comment on column public.emergency_requests.completed_at is
  'Shared completion state, independent of each recipient''s read receipt. Null means open.';

create function public.complete_emergency_request(p_request_id int8)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id int8;
  actor_role public.app_role;
  request_team text;
  saved_completed_at timestamptz;
begin
  select profiles.id, profiles.role into actor_profile_id, actor_role
  from public.profiles as profiles
  where profiles.user_id = (select auth.uid());

  if actor_role is null or actor_role not in ('admin', 'medical_staff', 'organization_team') then
    raise exception 'Emergency team access required.' using errcode = '42501';
  end if;

  select requests.target_team, requests.completed_at
  into request_team, saved_completed_at
  from public.emergency_requests as requests
  where requests.id = p_request_id
  for update;

  if not found then
    raise exception 'Emergency request not found.' using errcode = 'P0002';
  end if;

  if actor_role <> 'admin'
    and not (actor_role = 'medical_staff' and request_team = 'medical')
    and not (actor_role = 'organization_team' and request_team = 'travel') then
    raise exception 'Emergency team access required.' using errcode = '42501';
  end if;

  -- Repeated or concurrent completion preserves the original actor and timestamp.
  if saved_completed_at is null then
    saved_completed_at := now();
    update public.emergency_requests
    set completed_at = saved_completed_at, completed_by_profile_id = actor_profile_id
    where id = p_request_id;
  end if;

  return saved_completed_at;
end;
$$;

create function public.admin_delete_emergency_request(p_request_id int8)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Existing foreign keys also remove receipts and private push attempts.
  delete from public.emergency_requests where id = p_request_id;
  if not found then
    raise exception 'Emergency request not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Recreate read RPCs because PostgreSQL cannot extend a table return type in place.
drop function public.list_my_emergency_messages();
create function public.list_my_emergency_messages()
returns table (
  request_id int8,
  requester_display_name text,
  target_team text,
  message text,
  location_label text,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  created_at timestamptz,
  read_at timestamptz,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requests.id, requests.requester_display_name, requests.target_team,
    requests.message, requests.location_label, requests.latitude, requests.longitude,
    requests.accuracy_meters, requests.created_at, recipients.read_at, requests.completed_at
  from public.emergency_request_recipients as recipients
  join public.emergency_requests as requests on requests.id = recipients.request_id
  join public.profiles as profiles on profiles.id = recipients.recipient_profile_id
  where profiles.user_id = (select auth.uid())
  order by requests.completed_at is not null, requests.created_at desc, requests.id desc
  limit 100;
$$;

drop function public.list_emergency_dashboard();
create function public.list_emergency_dashboard()
returns table (
  request_id int8,
  requester_display_name text,
  target_team text,
  message text,
  location_label text,
  latitude double precision,
  longitude double precision,
  accuracy_meters double precision,
  created_at timestamptz,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  select profiles.role into actor_role
  from public.profiles as profiles
  where profiles.user_id = (select auth.uid());

  if actor_role is null or actor_role not in ('admin', 'medical_staff', 'organization_team') then
    raise exception 'Emergency dashboard access required.' using errcode = '42501';
  end if;

  return query
  select
    requests.id, requests.requester_display_name, requests.target_team,
    requests.message, requests.location_label, requests.latitude, requests.longitude,
    requests.accuracy_meters, requests.created_at, requests.completed_at
  from public.emergency_requests as requests
  where actor_role = 'admin'
    or (actor_role = 'medical_staff' and requests.target_team = 'medical')
    or (actor_role = 'organization_team' and requests.target_team = 'travel')
  order by requests.completed_at is not null, requests.created_at desc, requests.id desc
  limit 200;
end;
$$;

revoke all on function public.complete_emergency_request(int8) from public, anon;
revoke all on function public.admin_delete_emergency_request(int8) from public, anon;
revoke all on function public.list_my_emergency_messages() from public, anon;
revoke all on function public.list_emergency_dashboard() from public, anon;
grant execute on function public.complete_emergency_request(int8) to authenticated;
grant execute on function public.admin_delete_emergency_request(int8) to authenticated;
grant execute on function public.list_my_emergency_messages() to authenticated;
grant execute on function public.list_emergency_dashboard() to authenticated;

notify pgrst, 'reload schema';
