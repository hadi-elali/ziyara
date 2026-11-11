-- A second reversible account status for required status checks.
alter table public.profiles add column is_battery_empty boolean not null default false;
alter table public.profiles add constraint profiles_one_status_exemption
  check (not (is_sick and is_battery_empty));
comment on column public.profiles.is_battery_empty is
  'Admin-managed empty-battery status. Exclusive with sickness and retained until an admin clears or replaces it.';
revoke update (is_battery_empty) on public.profiles from public, anon, authenticated;

create or replace function public.admin_set_user_sick(p_user_id uuid, p_is_sick boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare saved_status boolean;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_is_sick is null then
    raise exception 'A user ID and sickness status are required.' using errcode = '22023';
  end if;

  -- Serialize against role changes and account deletion; recheck after waiting.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.admin_set_user_role', 0)
  );
  if not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  update public.profiles set is_sick = p_is_sick,
    is_battery_empty = case when p_is_sick then false else is_battery_empty end
  where user_id = p_user_id returning is_sick into saved_status;
  if not found then
    raise exception 'User profile not found.' using errcode = 'P0002';
  end if;
  return saved_status;
end;
$$;
revoke all on function public.admin_set_user_sick(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_sick(uuid, boolean) to authenticated;

create function public.admin_set_user_battery_empty(p_user_id uuid, p_is_battery_empty boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare saved_status boolean;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_is_battery_empty is null then
    raise exception 'A user ID and battery status are required.' using errcode = '22023';
  end if;

  -- Serialize against role changes and account deletion; recheck after waiting.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.admin_set_user_role', 0)
  );
  if not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  update public.profiles set is_battery_empty = p_is_battery_empty,
    is_sick = case when p_is_battery_empty then false else is_sick end
  where user_id = p_user_id returning is_battery_empty into saved_status;
  if not found then
    raise exception 'User profile not found.' using errcode = 'P0002';
  end if;
  return saved_status;
end;
$$;
revoke all on function public.admin_set_user_battery_empty(uuid, boolean) from public, anon;
grant execute on function public.admin_set_user_battery_empty(uuid, boolean) to authenticated;

drop function public.admin_list_users();

create function public.admin_list_users()
returns table (
  user_id uuid,
  display_name text,
  member_type public.member_type,
  party_size int8,
  luggage_count int8,
  sim_card_count int8,
  role public.app_role,
  family_id int8,
  family_name text,
  emergency_on_duty boolean,
  age integer,
  is_sick boolean,
  is_battery_empty boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return query
  select
    profiles.user_id,
    profiles.display_name,
    profiles.member_type,
    profiles.party_size,
    profiles.luggage_count,
    profiles.sim_card_count,
    profiles.role,
    families.id,
    families.name,
    duties.profile_id is not null,
    extract(year from age(current_date, profiles.birth_date))::integer,
    profiles.is_sick,
    profiles.is_battery_empty
  from public.profiles as profiles
  left join public.account_families as families on families.id = profiles.family_id
  left join public.emergency_team_duties as duties on duties.profile_id = profiles.id
  order by families.name nulls last, profiles.display_name, profiles.user_id;
end;
$$;

comment on function public.admin_list_users() is
  'Returns account administration data and current completed age derived from birth date. Accounts without a birth date have no derived age; birth dates are not exposed.';

revoke all on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;


drop function public.admin_group_check_results(int8);

create function public.admin_group_check_results(p_check_id int8)
returns table (
  display_name text,
  party_size int8,
  answer boolean,
  is_sick boolean,
  is_battery_empty boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.group_checks as checks
    where checks.id = p_check_id
  ) then
    raise exception 'Group check not found.' using errcode = 'P0002';
  end if;

  return query
  select
    profiles.display_name,
    profiles.party_size,
    responses.answer,
    profiles.is_sick,
    profiles.is_battery_empty
  from public.profiles as profiles
  left join public.group_check_responses as responses
    on responses.profile_id = profiles.id
   and responses.check_id = p_check_id
  order by profiles.display_name, profiles.id;
end;
$$;

comment on function public.admin_group_check_results(int8) is
  'Returns every current profile with party size and its nullable response for one group check.';


revoke all on function public.admin_group_check_results(bigint) from public, anon;
grant execute on function public.admin_group_check_results(bigint) to authenticated;

create or replace function public.claim_group_check_notifications(p_check_id bigint, p_requester_user_id uuid)
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

  -- A sick account is excused from the check, including marks made after activation.
  update public.group_check_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'recipient_sick'
    where a.check_id = target.id and a.claimed_at is null and exists (
      select 1 from public.profiles p
      where p.id = a.recipient_profile_id and p.is_sick
    );

  -- Battery-empty accounts are excused, including marks made after activation.
  update public.group_check_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'recipient_battery_empty'
    where a.check_id = target.id and a.claimed_at is null and exists (
      select 1 from public.profiles p
      where p.id = a.recipient_profile_id and p.is_battery_empty
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

notify pgrst, 'reload schema';
