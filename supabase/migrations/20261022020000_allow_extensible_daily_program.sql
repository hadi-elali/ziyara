-- Allow the daily program to grow one day at a time without a fixed batch limit.
-- Keep admin authorization, unique dates and atomic upserts unchanged.
create or replace function public.admin_upsert_daily_programs(
  p_programs jsonb
)
returns setof public.daily_programs
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id int8;
  program_count int;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_programs is null or jsonb_typeof(p_programs) <> 'array' then
    raise exception 'Daily programs must be a JSON array.' using errcode = '22023';
  end if;

  program_count := jsonb_array_length(p_programs);
  if program_count < 1 then
    raise exception 'At least one daily program is required.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_programs) as programs(program_date date, title text, details text)
    group by programs.program_date
    having count(*) > 1
  ) then
    raise exception 'Each program date may occur only once.' using errcode = '22023';
  end if;

  select profiles.id into actor_profile_id
  from public.profiles as profiles
  where profiles.user_id = (select auth.uid());

  return query
  insert into public.daily_programs as daily_programs (
    program_date,
    title,
    details,
    published_by_profile_id
  )
  select
    programs.program_date,
    nullif(btrim(programs.title), ''),
    btrim(programs.details),
    actor_profile_id
  from jsonb_to_recordset(p_programs) as programs(program_date date, title text, details text)
  on conflict (program_date)
  do update set
    title = excluded.title,
    details = excluded.details,
    published_by_profile_id = excluded.published_by_profile_id
  returning daily_programs.*;
end;
$$;

revoke all on function public.admin_upsert_daily_programs(jsonb) from public, anon;
grant execute on function public.admin_upsert_daily_programs(jsonb) to authenticated;
