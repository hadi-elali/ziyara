-- Group names are required, but a single character such as "A" or "1" is valid.
-- Preserve existing names, the upper bound and the unique-name index.
alter table public.organization_groups
  drop constraint organization_groups_name_check,
  add constraint organization_groups_name_check
    check (btrim(name) <> '' and char_length(btrim(name)) <= 80);

create or replace function public.admin_save_organization_group(
  p_name text, p_leader_user_ids uuid[], p_member_user_ids uuid[],
  p_family_ids bigint[] default '{}', p_group_id bigint default null
) returns public.organization_groups
language plpgsql security definer set search_path = '' as $$
declare members uuid[]; saved public.organization_groups;
begin
  if not coalesce((select public.is_admin()), false) then raise exception 'Admin access required.' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(20261008, 1);
  if p_name is null or btrim(p_name) = '' or char_length(btrim(p_name)) > 80 then
    raise exception 'Group name is required and must not exceed 80 characters.' using errcode = '22023';
  end if;
  if cardinality(p_leader_user_ids) is null or cardinality(p_leader_user_ids) < 1 or array_position(p_leader_user_ids, null) is not null then
    raise exception 'At least one registered group leader is required.' using errcode = '22023';
  end if;
  if exists(select 1 from unnest(p_family_ids) f(id) where not exists(select 1 from public.account_families a where a.id = f.id)) then
    raise exception 'Family not found.' using errcode = 'P0002';
  end if;
  select array_agg(distinct id) into members from (
    select unnest(p_member_user_ids) id union select unnest(p_leader_user_ids)
    union select user_id from public.profiles where family_id = any(p_family_ids)
  ) all_members;
  if cardinality(members) > 1000 or array_position(members, null) is not null or
    (select count(*) from public.profiles where user_id = any(members)) <> cardinality(members) then
    raise exception 'Valid registered group members are required (maximum 1000 accounts).' using errcode = '22023';
  end if;
  if exists(select 1 from public.organization_group_members where user_id = any(members) and (p_group_id is null or group_id <> p_group_id)) then
    raise exception 'Eine Person oder ein Familienmitglied gehört bereits zu einer anderen Gruppe.' using errcode = '23505';
  end if;
  if p_group_id is null then
    insert into public.organization_groups(name) values(btrim(p_name)) returning * into saved;
  else
    update public.organization_groups set name = btrim(p_name) where id = p_group_id returning * into saved;
    if not found then raise exception 'Group not found.' using errcode = 'P0002'; end if;
    -- Membership and leadership changes invalidate every outstanding location request.
    delete from public.organization_group_members where group_id = p_group_id;
  end if;
  insert into public.organization_group_members(group_id, user_id, is_leader)
    select saved.id, id, id = any(p_leader_user_ids) from unnest(members) m(id);
  return saved;
end;
$$;

revoke all on function public.admin_save_organization_group(text, uuid[], uuid[], bigint[], bigint) from public, anon;
grant execute on function public.admin_save_organization_group(text, uuid[], uuid[], bigint[], bigint) to authenticated;
notify pgrst, 'reload schema';
