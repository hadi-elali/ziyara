-- A notification belongs to one agenda line, identified independently of its
-- text/position so identical lines and reordered programs remain distinguishable.
create table public.daily_program_items (
  id bigint generated always as identity primary key,
  program_id bigint not null references public.daily_programs(id) on delete cascade,
  position integer not null check (position >= 0),
  details text not null check (char_length(btrim(details)) between 1 and 4000),
  push_scheduled_at timestamptz,
  push_started_at timestamptz,
  unique(program_id, position) deferrable initially deferred
);
alter table public.daily_program_items enable row level security;
revoke all on public.daily_program_items from public, anon, authenticated;
grant select on public.daily_program_items to authenticated;
grant select, insert, update, delete on public.daily_program_items to service_role;
grant usage, select on sequence public.daily_program_items_id_seq to service_role;
create policy "Authenticated users can read daily program items"
  on public.daily_program_items for select to authenticated using ((select auth.uid()) is not null);

insert into public.daily_program_items(program_id, position, details)
  select p.id, (row_number() over(partition by p.id order by line.ordinality) - 1)::integer,
    btrim(line.value, E' \t\r\n')
  from public.daily_programs p
  cross join lateral regexp_split_to_table(p.details, E'\r?\n') with ordinality line(value, ordinality)
  where btrim(line.value, E' \t\r\n') <> '';

-- Retire day-wide scheduling. Never guess which agenda item a legacy push meant.
drop trigger queue_daily_program_push on public.daily_programs;
drop trigger validate_daily_program_push_schedule on public.daily_programs;
drop function public.queue_daily_program_push();
drop function public.validate_daily_program_push_schedule();
revoke all on function public.admin_schedule_daily_program_push(bigint, timestamptz) from authenticated;
update public.daily_programs set push_scheduled_at = null, push_started_at = null
  where push_scheduled_at is not null or push_started_at is not null;
update public.daily_program_push_jobs set cancelled_at = coalesce(cancelled_at, now());
alter table public.daily_program_push_jobs
  add column item_id bigint references public.daily_program_items(id) on delete set null;
drop index public.daily_program_one_live_push_job;
create unique index daily_program_one_live_item_push_job
  on public.daily_program_push_jobs(item_id) where cancelled_at is null and item_id is not null;

create function public.validate_daily_program_item_push_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.push_scheduled_at is distinct from old.push_scheduled_at then
    new.push_started_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_daily_program_item_push_schedule() from public, anon, authenticated;
create trigger validate_daily_program_item_push_schedule
before insert or update of push_scheduled_at on public.daily_program_items
for each row execute function public.validate_daily_program_item_push_schedule();

create function public.queue_daily_program_item_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.daily_program_push_jobs set cancelled_at = coalesce(cancelled_at, now())
      where item_id = old.id and cancelled_at is null;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.push_scheduled_at is not distinct from old.push_scheduled_at then
    return new;
  end if;
  if new.push_scheduled_at is not null and
    (not isfinite(new.push_scheduled_at) or new.push_scheduled_at < now()) then
    raise exception 'Choose a future push time.' using errcode = '22023';
  end if;
  update public.daily_program_push_jobs set cancelled_at = now()
    where item_id = new.id and cancelled_at is null;
  if new.push_scheduled_at is not null then
    insert into public.daily_program_push_jobs(program_id, item_id, scheduled_at)
      values(new.program_id, new.id, new.push_scheduled_at);
  end if;
  return new;
end;
$$;
revoke all on function public.queue_daily_program_item_push() from public, anon, authenticated;
create trigger queue_daily_program_item_push
after insert or update of push_scheduled_at on public.daily_program_items
for each row execute function public.queue_daily_program_item_push();
create trigger cancel_daily_program_item_push
before delete on public.daily_program_items
for each row execute function public.queue_daily_program_item_push();

create function public.sync_daily_program_items()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  line record;
  kept bigint[] := '{}';
  item_id bigint;
  next_position integer := 0;
begin
  if tg_op = 'UPDATE' and new.details is not distinct from old.details then return new; end if;
  for line in select btrim(value, E' \t\r\n') as details
    from regexp_split_to_table(new.details, E'\r?\n') with ordinality lines(value, ordinality)
    where btrim(value, E' \t\r\n') <> '' order by ordinality
  loop
    -- Match unchanged lines in occurrence order. Edited/removed text loses its
    -- old identity and schedule; inserting/reordering other lines preserves it.
    select i.id into item_id from public.daily_program_items i
      where i.program_id = new.id and i.details = line.details and not (i.id = any(kept))
      order by i.position, i.id limit 1;
    if found then
      update public.daily_program_items set position = next_position
        where id = item_id and position is distinct from next_position;
    else
      insert into public.daily_program_items(program_id, position, details)
        values(new.id, next_position, line.details) returning id into item_id;
    end if;
    kept := array_append(kept, item_id);
    next_position := next_position + 1;
  end loop;
  delete from public.daily_program_items where program_id = new.id and not (id = any(kept));
  return new;
end;
$$;
revoke all on function public.sync_daily_program_items() from public, anon, authenticated;
create trigger sync_daily_program_items
after insert or update of details on public.daily_programs
for each row execute function public.sync_daily_program_items();

create function public.admin_schedule_daily_program_item_push(
  p_item_id bigint, p_scheduled_at timestamptz, p_send_now boolean default false
)
returns public.daily_program_items language plpgsql security definer set search_path = '' as $$
declare
  parent_id bigint;
  saved public.daily_program_items;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  select program_id into parent_id from public.daily_program_items where id = p_item_id;
  -- All writers and claims lock program -> item -> job, including text edits.
  perform 1 from public.daily_programs where id = parent_id for update;
  update public.daily_program_items set push_scheduled_at = case when p_send_now then now() else p_scheduled_at end
    where id = p_item_id returning * into saved;
  if not found then raise exception 'Daily program item not found.' using errcode = 'P0002'; end if;
  -- Notify the existing program subscription once, without publishing hundreds
  -- of separate item events during a multi-day content edit.
  update public.daily_programs set updated_at = now() where id = parent_id;
  return saved;
end;
$$;
revoke all on function public.admin_schedule_daily_program_item_push(bigint, timestamptz, boolean) from public, anon;
grant execute on function public.admin_schedule_daily_program_item_push(bigint, timestamptz, boolean) to authenticated;

drop function public.claim_due_daily_program_notifications();
create function public.claim_due_daily_program_notifications()
returns table(attempt_id bigint, program_id bigint, item_id bigint, expo_push_token text, title text, body text)
language plpgsql security definer set search_path = '' as $$
declare
  program public.daily_programs;
  item public.daily_program_items;
  job public.daily_program_push_jobs;
begin
  for program in
    select p.* from public.daily_programs p where exists (
      select 1 from public.daily_program_push_jobs j
      where j.program_id = p.id and j.item_id is not null and j.cancelled_at is null and j.scheduled_at <= now()
        and (j.started_at is null or exists (
          select 1 from public.daily_program_push_attempts a where a.job_id = j.id and a.claimed_at is null
        ))
    ) order by p.id for update of p skip locked
  loop
    for job in
      select j.* from public.daily_program_push_jobs j
      where j.program_id = program.id and j.item_id is not null and j.cancelled_at is null and j.scheduled_at <= now()
        and (j.started_at is null or exists (
          select 1 from public.daily_program_push_attempts a where a.job_id = j.id and a.claimed_at is null
        )) order by j.id for update
    loop
      select * into item from public.daily_program_items i where i.id = job.item_id;
      if not found then continue; end if;
      if job.started_at is null then
        update public.daily_program_push_jobs j
          set started_at = now(), title = program.title, body = item.details
          where j.id = job.id returning * into job;
        update public.daily_program_items set push_started_at = now() where id = item.id;
        update public.daily_programs set updated_at = now() where id = program.id;
        insert into public.daily_program_push_attempts(job_id, device_id, recipient_profile_id)
          select job.id, d.id, d.profile_id from public.push_notification_devices d;
      end if;
      update public.daily_program_push_attempts a
        set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'device_unregistered'
        where a.job_id = job.id and a.claimed_at is null and not exists (
          select 1 from public.push_notification_devices d where d.id = a.device_id and d.profile_id = a.recipient_profile_id
        );
      return query
        with batch as (
          select a.id from public.daily_program_push_attempts a
            where a.job_id = job.id and a.claimed_at is null order by a.id limit 100
        ), claimed as (
          update public.daily_program_push_attempts a set claimed_at = now()
            from batch where a.id = batch.id returning a.id, a.device_id
        )
        select c.id, program.id, item.id, d.expo_push_token,
          (case d.locale when 'ar' then 'البرنامج اليومي' when 'en' then 'Daily program' else 'Tagesprogramm' end)
            || ' · ' || program.program_date::text,
          left(coalesce(job.title || E'\n', '') || job.body, 500)
        from claimed c join public.push_notification_devices d on d.id = c.device_id order by c.id;
      if found then return; end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.claim_due_daily_program_notifications() from public, anon, authenticated;
grant execute on function public.claim_due_daily_program_notifications() to service_role;

-- Content publishing never creates or modifies notification schedules.
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
