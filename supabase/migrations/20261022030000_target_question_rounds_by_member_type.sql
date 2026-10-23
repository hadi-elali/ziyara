-- Existing rounds retain their history and an unknown audience. They must be
-- closed and reopened with an explicit audience before accepting more questions.
alter table public.question_rounds
add column target_member_type public.member_type;

comment on column public.question_rounds.target_member_type is
  'Required audience for new rounds. Null preserves legacy rounds without guessing their audience; submissions to those rounds are denied.';

create or replace function public.open_question_round(p_target_member_type public.member_type)
returns public.question_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  opened_round public.question_rounds;
begin
  if not (select public.can_manage_question_rounds()) then
    raise exception 'Admin or scholar access required.' using errcode = '42501';
  end if;

  if p_target_member_type is null then
    raise exception 'Bitte wähle Brüder oder Schwestern für die Fragerunde aus.' using errcode = '22023';
  end if;

  insert into public.question_rounds (target_member_type)
  values (p_target_member_type)
  returning * into opened_round;

  return opened_round;
exception
  when unique_violation then
    raise exception 'A question round is already open.' using errcode = '23505';
end;
$$;

-- Older clients must also choose an audience; never silently open for everyone.
create or replace function public.open_question_round()
returns public.question_rounds
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.can_manage_question_rounds()) then
    raise exception 'Admin or scholar access required.' using errcode = '42501';
  end if;

  raise exception 'Bitte wähle Brüder oder Schwestern für die Fragerunde aus.' using errcode = '22023';
end;
$$;

create or replace function public.submit_anonymous_question(p_round_id int8, p_question text)
returns public.anonymous_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_question text := btrim(p_question);
  submitter_profile_id int8;
  submitter_member_type public.member_type;
  round_member_type public.member_type;
  updated_submission_count int4;
  saved_question public.anonymous_questions;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select profiles.id, profiles.member_type
  into submitter_profile_id, submitter_member_type
  from public.profiles as profiles
  where profiles.user_id = (select auth.uid());

  if submitter_profile_id is null then
    raise exception 'A user profile is required to submit questions.' using errcode = '42501';
  end if;

  if normalized_question is null or char_length(normalized_question) not between 3 and 500 then
    raise exception 'Question must contain between 3 and 500 characters.' using errcode = '22023';
  end if;

  -- Keep the shared row lock until the question and private counter are saved,
  -- preserving serialization against round closure and counter cleanup.
  select target_member_type into round_member_type
  from public.question_rounds
  where id = p_round_id
    and closed_at is null
  for share;

  if not found then
    raise exception 'Open question round not found.' using errcode = 'P0002';
  end if;

  if round_member_type is null then
    raise exception 'Für diese Fragerunde muss zuerst eine Zielgruppe festgelegt werden.' using errcode = '42501';
  end if;

  if submitter_member_type is null then
    raise exception 'Für dein Konto ist keine Zuordnung als Bruder oder Schwester hinterlegt.' using errcode = '42501';
  end if;

  if submitter_member_type is distinct from round_member_type then
    if round_member_type = 'brother' then
      raise exception 'An dieser Fragerunde können nur Brüder Fragen stellen.' using errcode = '42501';
    else
      raise exception 'An dieser Fragerunde können nur Schwestern Fragen stellen.' using errcode = '42501';
    end if;
  end if;

  insert into public.question_submission_limits (round_id, profile_id, submission_count)
  values (p_round_id, submitter_profile_id, 1)
  on conflict (round_id, profile_id)
  do update
    set submission_count = public.question_submission_limits.submission_count + 1
    where public.question_submission_limits.submission_count < 5
  returning submission_count into updated_submission_count;

  if updated_submission_count is null then
    raise exception 'Question submission limit reached.' using errcode = 'P0001';
  end if;

  insert into public.anonymous_questions (round_id, question)
  values (p_round_id, normalized_question)
  returning * into saved_question;

  return saved_question;
end;
$$;

comment on table public.question_rounds is
  'Admin- and scholar-controlled anonymous question rounds restricted to the selected brother/sister profile member type, regardless of app role.';
comment on function public.submit_anonymous_question(int8, text) is
  'Stores up to five anonymous questions only for profiles matching the round audience. Question rows never persist a sender identity; counters are removed on closure.';

revoke all on function public.open_question_round(public.member_type) from public, anon;
revoke all on function public.open_question_round() from public, anon;
revoke all on function public.submit_anonymous_question(int8, text) from public, anon;
grant execute on function public.open_question_round(public.member_type) to authenticated;
grant execute on function public.open_question_round() to authenticated;
grant execute on function public.submit_anonymous_question(int8, text) to authenticated;

notify pgrst, 'reload schema';
