-- Compute current ages when the admin list is read, keeping registration
-- snapshots intact and leaving accounts without a birth date unspecified.
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
  age integer
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
    extract(year from age(current_date, profiles.birth_date))::integer
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

notify pgrst, 'reload schema';
