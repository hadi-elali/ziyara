-- Keep legacy null audiences closed to submissions; explicitly support everyone
-- without adding 'all' to the brother/sister enum used by account profiles.
alter table public.question_rounds
  alter column target_member_type type text using target_member_type::text;
alter table public.question_rounds
  add constraint question_rounds_valid_audience
  check (target_member_type in ('all', 'brother', 'sister'));

comment on column public.question_rounds.target_member_type is
  'Explicit all/brother/sister audience. Null preserves legacy rounds without guessing an audience.';

create table public.question_round_push_attempts (
  id bigint generated always as identity primary key,
  round_id bigint not null references public.question_rounds(id) on delete cascade,
  device_id bigint references public.push_notification_devices(id) on delete set null,
  recipient_profile_id bigint references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  completed_at timestamptz,
  accepted boolean,
  error_code text check (error_code is null or error_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  expo_http_status integer check (expo_http_status between 100 and 599),
  expo_ticket_id uuid,
  unique(round_id, device_id)
);
create index question_round_push_attempts_round_idx
  on public.question_round_push_attempts(round_id);
alter table public.question_round_push_attempts enable row level security;
revoke all on public.question_round_push_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.question_round_push_attempts to service_role;
grant usage, select on sequence public.question_round_push_attempts_id_seq to service_role;

create function public.open_question_round(p_audience text)
returns public.question_rounds
language plpgsql security definer set search_path = '' as $$
declare opened_round public.question_rounds;
begin
  if not (select public.can_manage_question_rounds()) then
    raise exception 'Admin or scholar access required.' using errcode = '42501';
  end if;
  if p_audience is null or p_audience not in ('all', 'brother', 'sister') then
    raise exception 'Bitte wähle alle, Brüder oder Schwestern für die Fragerunde aus.' using errcode = '22023';
  end if;

  insert into public.question_rounds(target_member_type)
  values (p_audience) returning * into opened_round;

  -- Snapshot recipients in the same transaction as activation. An empty target
  -- stays empty; newly registered devices never receive an old round's push.
  insert into public.question_round_push_attempts(round_id, device_id, recipient_profile_id)
    select opened_round.id, d.id, d.profile_id
    from public.push_notification_devices d
    join public.profiles p on p.id = d.profile_id
    where p_audience = 'all' or p.member_type::text = p_audience;
  return opened_round;
exception
  when unique_violation then
    raise exception 'A question round is already open.' using errcode = '23505';
end;
$$;

-- Preserve installed clients that explicitly choose brothers or sisters.
create or replace function public.open_question_round(p_target_member_type public.member_type)
returns public.question_rounds
language plpgsql security definer set search_path = '' as $$
begin
  return public.open_question_round(p_audience => p_target_member_type::text);
end;
$$;

create or replace function public.open_question_round()
returns public.question_rounds
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.can_manage_question_rounds()) then
    raise exception 'Admin or scholar access required.' using errcode = '42501';
  end if;
  raise exception 'Bitte wähle alle, Brüder oder Schwestern für die Fragerunde aus.' using errcode = '22023';
end;
$$;

create or replace function public.submit_anonymous_question(p_round_id int8, p_question text)
returns public.anonymous_questions
language plpgsql security definer set search_path = '' as $$
declare
  normalized_question text := btrim(p_question);
  submitter_profile_id int8;
  submitter_member_type public.member_type;
  round_audience text;
  updated_submission_count int4;
  saved_question public.anonymous_questions;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select p.id, p.member_type into submitter_profile_id, submitter_member_type
  from public.profiles p where p.user_id = (select auth.uid());
  if submitter_profile_id is null then
    raise exception 'A user profile is required to submit questions.' using errcode = '42501';
  end if;
  if normalized_question is null or char_length(normalized_question) not between 3 and 500 then
    raise exception 'Question must contain between 3 and 500 characters.' using errcode = '22023';
  end if;
  select target_member_type into round_audience
  from public.question_rounds where id = p_round_id and closed_at is null for share;
  if not found then
    raise exception 'Open question round not found.' using errcode = 'P0002';
  end if;
  if round_audience is null then
    raise exception 'Für diese Fragerunde muss zuerst eine Zielgruppe festgelegt werden.' using errcode = '42501';
  end if;
  if round_audience <> 'all' then
    if submitter_member_type is null then
      raise exception 'Für dein Konto ist keine Zuordnung als Bruder oder Schwester hinterlegt.' using errcode = '42501';
    end if;
    if submitter_member_type::text is distinct from round_audience then
      if round_audience = 'brother' then
        raise exception 'An dieser Fragerunde können nur Brüder Fragen stellen.' using errcode = '42501';
      else
        raise exception 'An dieser Fragerunde können nur Schwestern Fragen stellen.' using errcode = '42501';
      end if;
    end if;
  end if;

  insert into public.question_submission_limits(round_id, profile_id, submission_count)
  values (p_round_id, submitter_profile_id, 1)
  on conflict (round_id, profile_id) do update
    set submission_count = public.question_submission_limits.submission_count + 1
    where public.question_submission_limits.submission_count < 5
  returning submission_count into updated_submission_count;
  if updated_submission_count is null then
    raise exception 'Question submission limit reached.' using errcode = 'P0001';
  end if;
  insert into public.anonymous_questions(round_id, question)
  values (p_round_id, normalized_question) returning * into saved_question;
  return saved_question;
end;
$$;

create function public.claim_question_round_notifications(p_round_id bigint, p_requester_user_id uuid)
returns table(attempt_id bigint, expo_push_token text, title text, body text)
language plpgsql security definer set search_path = '' as $$
declare target public.question_rounds;
begin
  if not exists (
    select 1 from public.profiles
    where user_id = p_requester_user_id and role in ('admin', 'scholar')
  ) then
    raise exception 'Admin or scholar access required.' using errcode = '42501';
  end if;

  -- Keep closure serialized against claiming each batch.
  select * into target from public.question_rounds where id = p_round_id for share;
  if not found then
    raise exception 'Question round not found.' using errcode = 'P0002';
  end if;
  if target.closed_at is not null or target.target_member_type is null then
    return;
  end if;

  update public.question_round_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'device_unregistered'
    where a.round_id = target.id and a.claimed_at is null and not exists (
      select 1 from public.push_notification_devices d
      where d.id = a.device_id and d.profile_id = a.recipient_profile_id
    );
  update public.question_round_push_attempts a
    set claimed_at = now(), completed_at = now(), accepted = false, error_code = 'audience_changed'
    where a.round_id = target.id and a.claimed_at is null and target.target_member_type <> 'all'
      and not exists (
        select 1 from public.profiles p where p.id = a.recipient_profile_id
          and p.member_type::text = target.target_member_type
      );

  return query
    with batch as (
      select a.id from public.question_round_push_attempts a
      where a.round_id = target.id and a.claimed_at is null
      order by a.id limit 100 for update skip locked
    ), claimed as (
      update public.question_round_push_attempts a set claimed_at = now()
      from batch where a.id = batch.id returning a.id, a.device_id
    )
    select c.id, d.expo_push_token,
      case d.locale
        when 'en' then 'Anonymous question round'
        when 'ar' then 'جولة أسئلة مجهولة'
        else 'Anonyme Fragerunde'
      end,
      case d.locale
        when 'en' then 'The anonymous question round is open. You can now submit your questions.'
        when 'ar' then 'جولة الأسئلة المجهولة مفتوحة. يمكنك الآن إرسال أسئلتك.'
        else 'Die anonyme Fragerunde ist geöffnet. Du kannst jetzt deine Fragen stellen.'
      end
    from claimed c join public.push_notification_devices d on d.id = c.device_id order by c.id;
end;
$$;

comment on table public.question_rounds is
  'Admin- and scholar-controlled anonymous question rounds for all profiles or the selected brother/sister audience.';
comment on table public.question_round_push_attempts is
  'Private activation recipient snapshot and one-time device claims; contains no submitted question or sender linkage.';

revoke all on function public.open_question_round(text) from public, anon;
revoke all on function public.open_question_round(public.member_type) from public, anon;
revoke all on function public.open_question_round() from public, anon;
revoke all on function public.submit_anonymous_question(int8, text) from public, anon;
grant execute on function public.open_question_round(text) to authenticated;
grant execute on function public.open_question_round(public.member_type) to authenticated;
grant execute on function public.open_question_round() to authenticated;
grant execute on function public.submit_anonymous_question(int8, text) to authenticated;
revoke all on function public.claim_question_round_notifications(bigint, uuid) from public, anon, authenticated;
grant execute on function public.claim_question_round_notifications(bigint, uuid) to service_role;

notify pgrst, 'reload schema';
