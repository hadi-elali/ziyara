begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select ok(
  (
    select count(*) = 7
    from information_schema.tables as tables
    where tables.table_schema = 'public'
      and tables.table_name in (
        'anonymous_questions',
        'group_check_responses',
        'group_checks',
        'profiles',
        'question_rounds',
        'question_submission_limits',
        'role_assignment_audit'
      )
  ),
  'all seven original application tables remain present'
);

select has_column('public', 'profiles', 'id', 'profiles.id remains present');
select has_column('public', 'profiles', 'user_id', 'profiles.user_id remains present');
select has_column('public', 'profiles', 'member_type', 'profiles.member_type remains present');
select has_column(
  'public',
  'group_check_responses',
  'id',
  'group_check_responses.id remains present'
);
select hasnt_index(
  'public',
  'group_check_responses',
  'group_check_responses_check_answer_idx',
  'the unused answer index is absent'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'phase5-admin@example.invalid',
    '{"display_name":"Phase 5 Admin"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'phase5-user-one@example.invalid',
    '{"display_name":"Phase 5 User One","member_type":"brother"}'::jsonb
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'phase5-user-two@example.invalid',
    '{"display_name":"Phase 5 User Two"}'::jsonb
  );

update public.profiles
set role = 'admin'
where user_id = '10000000-0000-0000-0000-000000000001';

insert into public.group_checks (id, question, created_by_profile_id)
overriding system value
select
  950000000000000001,
  'Phase 5 RLS fixture?',
  profiles.id
from public.profiles as profiles
where profiles.user_id = '10000000-0000-0000-0000-000000000001';

insert into public.group_check_responses (check_id, profile_id, answer)
select
  950000000000000001,
  profiles.id,
  profiles.user_id = '10000000-0000-0000-0000-000000000002'
from public.profiles as profiles
where profiles.user_id in (
  '10000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000003'
);

insert into public.question_rounds (id, target_member_type)
overriding system value
values (950000000000000001, 'brother');

select results_eq(
  $$
    select tables.table_name::text
    from information_schema.tables as tables
    where tables.table_schema = 'public'
      and tables.table_name in (
        'anonymous_questions',
        'group_check_responses',
        'group_checks',
        'profiles',
        'question_rounds',
        'question_submission_limits',
        'role_assignment_audit'
      )
      and has_table_privilege(
        'anon',
        format('%I.%I', tables.table_schema, tables.table_name),
        'select'
      )
    order by tables.table_name
  $$,
  $$ select null::text where false $$,
  'anon has no direct read grant on any application table'
);

set local role anon;

select throws_ok(
  $$ select id from public.profiles $$,
  '42501',
  'permission denied for table profiles',
  'an anonymous request is rejected by the table privileges'
);

reset role;

select ok(
  not has_function_privilege('anon', 'public.admin_list_users()', 'execute'),
  'anon cannot execute an administrative RPC'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select results_eq(
  $$
    select responses.profile_id
    from public.group_check_responses as responses
    order by responses.profile_id
  $$,
  $$
    select profiles.id
    from public.profiles as profiles
    where profiles.user_id = '10000000-0000-0000-0000-000000000002'
  $$,
  'an authenticated user reads only their own group-check response'
);

select throws_ok(
  $$ select * from public.admin_list_users() $$,
  '42501',
  'Admin access required.',
  'a normal user cannot execute an administrative RPC'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$ select * from public.admin_list_users() $$,
  'an admin can execute an administrative RPC'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.submit_anonymous_question(950000000000000001, 'Phase 5 Frage eins?') $$,
  'the first anonymous question is accepted'
);
select lives_ok(
  $$ select public.submit_anonymous_question(950000000000000001, 'Phase 5 Frage zwei?') $$,
  'the second anonymous question is accepted'
);
select lives_ok(
  $$ select public.submit_anonymous_question(950000000000000001, 'Phase 5 Frage drei?') $$,
  'the third anonymous question is accepted'
);
select lives_ok(
  $$ select public.submit_anonymous_question(950000000000000001, 'Phase 5 Frage vier?') $$,
  'the fourth anonymous question is accepted'
);
select lives_ok(
  $$ select public.submit_anonymous_question(950000000000000001, 'Phase 5 Frage fünf?') $$,
  'the fifth anonymous question is accepted'
);
select throws_ok(
  $$ select public.submit_anonymous_question(950000000000000001, 'Phase 5 Frage sechs?') $$,
  'P0001',
  'Question submission limit reached.',
  'a sixth anonymous question is rejected'
);

reset role;

select is(
  (
    select count(*)
    from public.anonymous_questions
    where round_id = 950000000000000001
  ),
  5::bigint,
  'exactly five anonymous questions were stored'
);
select is(
  (
    select limits.submission_count
    from public.question_submission_limits as limits
    where limits.round_id = 950000000000000001
  ),
  5,
  'the temporary counter stops at five'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.close_question_round(950000000000000001) $$,
  'an admin can close the question round'
);

reset role;

select is(
  (
    select count(*)
    from public.question_submission_limits
    where round_id = 950000000000000001
  ),
  0::bigint,
  'closing the question round deletes its temporary counters'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.admin_set_user_role(
      '10000000-0000-0000-0000-000000000001',
      'user'
    )
  $$,
  'P0001',
  'At least one administrator must remain.',
  'the last admin cannot be demoted'
);

reset role;

select is(
  (
    select profiles.role::text
    from public.profiles as profiles
    where profiles.user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'admin',
  'the protected last admin keeps the admin role'
);

select * from finish();

rollback;
