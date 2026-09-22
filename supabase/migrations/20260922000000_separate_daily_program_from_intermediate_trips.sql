drop policy if exists "Authenticated users can read the current trip daily program"
on public.trip_daily_programs;

drop function if exists public.can_read_current_trip_daily_program(int8);
drop function if exists public.admin_upsert_trip_daily_programs(int8, jsonb);

-- The daily program describes the complete pilgrimage. If older, already closed
-- intermediate trips contain the same date, keep the active or most recently
-- edited version before enforcing one program per calendar date.
with ranked_programs as (
  select
    programs.id,
    row_number() over (
      partition by programs.program_date
      order by
        exists (
          select 1
          from public.trips as trips
          where trips.id = programs.trip_id
            and trips.archived_at is null
        ) desc,
        programs.updated_at desc,
        programs.id desc
    ) as duplicate_rank
  from public.trip_daily_programs as programs
)
delete from public.trip_daily_programs as programs
using ranked_programs
where programs.id = ranked_programs.id
  and ranked_programs.duplicate_rank > 1;

drop index if exists public.trip_daily_programs_date_idx;

alter table public.trip_daily_programs
  drop constraint if exists trip_daily_programs_trip_id_program_date_key,
  drop column trip_id;

alter table public.trip_daily_programs rename to daily_programs;
alter table public.daily_programs rename constraint trip_daily_programs_pkey
  to daily_programs_pkey;
alter trigger set_trip_daily_programs_updated_at on public.daily_programs
  rename to set_daily_programs_updated_at;

alter table public.daily_programs
  add constraint daily_programs_program_date_key unique (program_date);

comment on table public.daily_programs is
  'One published daily program per calendar date for the complete pilgrimage, independent of intermediate trips.';

create policy "Authenticated users can read the complete daily program"
on public.daily_programs
for select
to authenticated
using ((select auth.uid()) is not null);

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
  if program_count < 1 or program_count > 14 then
    raise exception 'Between one and fourteen daily programs are required.'
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
