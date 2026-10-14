create or replace function public.can_manage_question_rounds()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.profiles
    where user_id = (select auth.uid())
      and role in ('admin', 'scholar')
  );
$$;

comment on function public.can_manage_question_rounds() is
  'Checks the current profile for narrowly scoped admin or scholar question-round access. Does not grant other administrative rights.';

revoke all on function public.can_manage_question_rounds() from public, anon;
grant execute on function public.can_manage_question_rounds() to authenticated;

drop policy "Only admins can read anonymous questions" on public.anonymous_questions;
create policy "Admins and scholars can read anonymous questions"
on public.anonymous_questions
for select
to authenticated
using ((select public.can_manage_question_rounds()));

create or replace function public.open_question_round()
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

  insert into public.question_rounds default values
  returning * into opened_round;

  return opened_round;
exception
  when unique_violation then
    raise exception 'A question round is already open.' using errcode = '23505';
end;
$$;

create or replace function public.close_question_round(p_round_id int8)
returns public.question_rounds
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_round public.question_rounds;
begin
  if not (select public.can_manage_question_rounds()) then
    raise exception 'Admin or scholar access required.' using errcode = '42501';
  end if;

  -- Retain the row lock against concurrent submissions and counter cleanup.
  update public.question_rounds
  set closed_at = now()
  where id = p_round_id
    and closed_at is null
  returning * into closed_round;

  if closed_round.id is null then
    raise exception 'Open question round not found.' using errcode = 'P0002';
  end if;

  delete from public.question_submission_limits
  where round_id = p_round_id;

  return closed_round;
end;
$$;

create or replace function public.set_anonymous_question_checked(
  p_question_id int8,
  p_is_checked boolean
)
returns public.anonymous_questions
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_question public.anonymous_questions;
begin
  if not (select public.can_manage_question_rounds()) then
    raise exception 'Admin or scholar access required.' using errcode = '42501';
  end if;

  update public.anonymous_questions
  set
    is_checked = p_is_checked,
    checked_at = case when p_is_checked then now() else null end
  where id = p_question_id
  returning * into updated_question;

  if updated_question.id is null then
    raise exception 'Anonymous question not found.' using errcode = 'P0002';
  end if;

  return updated_question;
end;
$$;

comment on table public.question_rounds is
  'Admin- and scholar-controlled windows during which any signed-in profile may submit anonymous questions.';

-- admin_set_user_role already accepts every app_role enum value, with audit
-- and last-admin protection. is_admin and unrelated permissions stay scoped.
revoke all on function public.open_question_round() from public, anon;
revoke all on function public.close_question_round(int8) from public, anon;
revoke all on function public.set_anonymous_question_checked(int8, boolean) from public, anon;
grant execute on function public.open_question_round() to authenticated;
grant execute on function public.close_question_round(int8) to authenticated;
grant execute on function public.set_anonymous_question_checked(int8, boolean) to authenticated;

notify pgrst, 'reload schema';
