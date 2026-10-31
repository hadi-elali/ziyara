-- Existing programs stay silent; all times supplied by clients are absolute UTC instants.
alter table public.daily_programs
  add column push_scheduled_at timestamptz,
  add column push_started_at timestamptz;

create table public.daily_program_push_jobs (
  id bigint generated always as identity primary key,
  program_id bigint not null references public.daily_programs(id) on delete cascade,
  scheduled_at timestamptz not null check (isfinite(scheduled_at)),
  started_at timestamptz,
  cancelled_at timestamptz,
  title text,
  body text
);
create unique index daily_program_one_live_push_job
  on public.daily_program_push_jobs(program_id) where cancelled_at is null;
create index daily_program_push_due_idx
  on public.daily_program_push_jobs(scheduled_at) where cancelled_at is null;

create table public.daily_program_push_attempts (
  id bigint generated always as identity primary key,
  job_id bigint not null references public.daily_program_push_jobs(id) on delete cascade,
  device_id bigint references public.push_notification_devices(id) on delete set null,
  recipient_profile_id bigint references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  accepted boolean,
  error_code text check (error_code is null or error_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  expo_http_status integer check (expo_http_status between 100 and 599),
  expo_ticket_id uuid,
  unique(job_id, device_id)
);
create index daily_program_push_pending_idx
  on public.daily_program_push_attempts(job_id) where claimed_at is null;

alter table public.daily_program_push_jobs enable row level security;
alter table public.daily_program_push_attempts enable row level security;
revoke all on public.daily_program_push_jobs, public.daily_program_push_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.daily_program_push_jobs, public.daily_program_push_attempts to service_role;
grant usage, select on sequence public.daily_program_push_jobs_id_seq, public.daily_program_push_attempts_id_seq to service_role;

create function public.validate_daily_program_push_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.push_scheduled_at is distinct from old.push_scheduled_at then
    new.push_started_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.validate_daily_program_push_schedule() from public, anon, authenticated;
create trigger validate_daily_program_push_schedule
before insert or update of push_scheduled_at on public.daily_programs
for each row execute function public.validate_daily_program_push_schedule();

create function public.queue_daily_program_push()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.push_scheduled_at is not distinct from old.push_scheduled_at then
    return new;
  end if;
  -- Validate after the upsert resolves its conflict: retaining an unchanged,
  -- already-started schedule must remain possible when only text is edited.
  if new.push_scheduled_at is not null and
    (not isfinite(new.push_scheduled_at) or new.push_scheduled_at <= now()) then
    raise exception 'Choose a future push time.' using errcode = '22023';
  end if;
  -- The program row is already locked. Claims take the same lock first, so an
  -- edit/cancellation stops every batch that has not yet been claimed.
  update public.daily_program_push_jobs set cancelled_at = now()
    where program_id = new.id and cancelled_at is null;
  if new.push_scheduled_at is not null then
    insert into public.daily_program_push_jobs(program_id, scheduled_at)
      values(new.id, new.push_scheduled_at);
  end if;
  return new;
end;
$$;
revoke all on function public.queue_daily_program_push() from public, anon, authenticated;
create trigger queue_daily_program_push
after insert or update of push_scheduled_at on public.daily_programs
for each row execute function public.queue_daily_program_push();

create or replace function public.admin_upsert_daily_programs(p_programs jsonb)
returns setof public.daily_programs
language plpgsql security definer set search_path = '' as $$
declare
  actor_profile_id bigint;
  entry jsonb;
  saved public.daily_programs;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_programs is null or jsonb_typeof(p_programs) <> 'array' then
    raise exception 'Daily programs must be a JSON array.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_programs) < 1 then
    raise exception 'At least one daily program is required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_programs) as p(program_date date)
      group by p.program_date having count(*) > 1
  ) then
    raise exception 'Each program date may occur only once.' using errcode = '22023';
  end if;
  select id into actor_profile_id from public.profiles where user_id = (select auth.uid());
  -- Stable lock ordering also keeps concurrent multi-day edits deadlock-free.
  for entry in select value from jsonb_array_elements(p_programs) order by (value->>'program_date')::date
  loop
    insert into public.daily_programs as p(program_date, title, details, published_by_profile_id, push_scheduled_at)
      values((entry->>'program_date')::date, nullif(btrim(entry->>'title'), ''),
        btrim(entry->>'details'), actor_profile_id, (entry->>'push_scheduled_at')::timestamptz)
    on conflict (program_date) do update set
      title = excluded.title,
      details = excluded.details,
      published_by_profile_id = excluded.published_by_profile_id,
      -- Older clients omit the field and preserve the schedule. Explicit null cancels it.
      push_scheduled_at = case when entry ? 'push_scheduled_at'
        then excluded.push_scheduled_at else p.push_scheduled_at end
    returning * into saved;
    return next saved;
  end loop;
end;
$$;
revoke all on function public.admin_upsert_daily_programs(jsonb) from public, anon;
grant execute on function public.admin_upsert_daily_programs(jsonb) to authenticated;

create function public.claim_due_daily_program_notifications()
returns table(attempt_id bigint, program_id bigint, expo_push_token text, title text, body text)
language plpgsql security definer set search_path = '' as $$
declare
  program public.daily_programs;
  job public.daily_program_push_jobs;
begin
  -- One batch per claim; the dispatcher drains batches until empty. Parent row
  -- locks order claims against edits, and SKIP LOCKED allows concurrent workers.
  for program in
    select p.* from public.daily_programs p
    where exists (
      select 1 from public.daily_program_push_jobs j
      where j.program_id = p.id and j.cancelled_at is null and j.scheduled_at <= now()
        and (j.started_at is null or exists (
          select 1 from public.daily_program_push_attempts a where a.job_id = j.id and a.claimed_at is null
        ))
    ) order by p.id for update of p skip locked
  loop
    select * into job from public.daily_program_push_jobs j
      where j.program_id = program.id and j.cancelled_at is null and j.scheduled_at <= now()
      for update;
    if not found then continue; end if;
    if job.started_at is null then
      update public.daily_program_push_jobs j
        set started_at = now(), title = program.title, body = program.details
        where j.id = job.id returning * into job;
      update public.daily_programs set push_started_at = now() where id = program.id;
      -- Snapshot devices at activation, including registrations since scheduling.
      insert into public.daily_program_push_attempts(job_id, device_id, recipient_profile_id)
        select job.id, d.id, d.profile_id from public.push_notification_devices d;
    end if;
    update public.daily_program_push_attempts a
      set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'device_unregistered'
      where a.job_id = job.id and a.claimed_at is null and not exists (
        select 1 from public.push_notification_devices d
        where d.id = a.device_id and d.profile_id = a.recipient_profile_id
      );
    return query
      with batch as (
        select a.id from public.daily_program_push_attempts a
          where a.job_id = job.id and a.claimed_at is null order by a.id limit 100
      ), claimed as (
        update public.daily_program_push_attempts a set claimed_at = now()
          from batch where a.id = batch.id returning a.id, a.device_id
      )
      select c.id, program.id, d.expo_push_token,
        (case d.locale when 'ar' then 'البرنامج اليومي' when 'en' then 'Daily program' else 'Tagesprogramm' end)
          || ' · ' || program.program_date::text,
        left(coalesce(job.title || E'\n', '') || job.body, 500)
      from claimed c join public.push_notification_devices d on d.id = c.device_id order by c.id;
    if found then return; end if;
  end loop;
end;
$$;
revoke all on function public.claim_due_daily_program_notifications() from public, anon, authenticated;
grant execute on function public.claim_due_daily_program_notifications() to service_role;
