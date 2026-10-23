begin;

create extension if not exists pgtap with schema extensions;
select plan(46);

select enum_has_labels('public', 'app_role', array['user', 'admin', 'medical_staff', 'organization_team', 'scholar']);
select ok(
  not has_function_privilege('anon', 'public.can_manage_question_rounds()', 'execute')
  and not has_function_privilege('anon', 'public.open_question_round()', 'execute')
  and not has_function_privilege('anon', 'public.close_question_round(bigint)', 'execute')
  and not has_function_privilege('anon', 'public.set_anonymous_question_checked(bigint, boolean)', 'execute'),
  'anonymous clients cannot execute question management RPCs'
);
select ok(
  not has_table_privilege('authenticated', 'public.anonymous_questions', 'insert,update,delete')
  and not has_table_privilege('authenticated', 'public.question_rounds', 'insert,update,delete'),
  'direct question and round writes remain unavailable'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'anonymous_questions'
      and column_name in ('user_id', 'profile_id', 'display_name', 'email')
  ),
  'question rows retain no sender identity'
);

-- Isolate active rounds and admin-count fixtures only within this rolled-back transaction.
update public.question_rounds set closed_at = now() where closed_at is null;
insert into auth.users (id, email, raw_user_meta_data) values
  ('13000000-0000-0000-0000-000000000001', 'scholar-admin@example.invalid', '{"display_name":"Scholar Test Admin"}'),
  ('13000000-0000-0000-0000-000000000002', 'scholar@example.invalid', '{"display_name":"Scholar Test","role":"scholar"}'),
  ('13000000-0000-0000-0000-000000000003', 'scholar-user@example.invalid', '{"display_name":"Scholar Test User","member_type":"brother"}'),
  ('13000000-0000-0000-0000-000000000004', 'scholar-medical@example.invalid', '{"display_name":"Scholar Test Medical"}'),
  ('13000000-0000-0000-0000-000000000005', 'scholar-organization@example.invalid', '{"display_name":"Scholar Test Organization"}');
update public.profiles set role = 'admin' where user_id = '13000000-0000-0000-0000-000000000001';
update public.profiles set role = 'user'
where role = 'admin' and user_id <> '13000000-0000-0000-0000-000000000001';
update public.profiles set role = 'medical_staff' where user_id = '13000000-0000-0000-0000-000000000004';
update public.profiles set role = 'organization_team' where user_id = '13000000-0000-0000-0000-000000000005';

select is(
  (select role::text from public.profiles where user_id = '13000000-0000-0000-0000-000000000002'),
  'user', 'signup metadata cannot self-assign the scholar role'
);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$ select public.admin_set_user_role('13000000-0000-0000-0000-000000000002', 'scholar') $$,
  'an admin can assign the scholar role through the existing RPC'
);
select ok(public.can_manage_question_rounds(), 'admins retain question management access');
select lives_ok($$ select public.open_question_round('brother') $$, 'admins can still start a round');
reset role;
select is(
  (select role::text from public.profiles where user_id = '13000000-0000-0000-0000-000000000002'),
  'scholar', 'the scholar role is persisted in the profile'
);
select is(
  (select count(*) from public.role_assignment_audit
   where target_user_id = '13000000-0000-0000-0000-000000000002' and new_role = 'scholar'),
  1::bigint, 'scholar assignment is audited'
);
select set_config('test.scholar_round_id', (select id::text from public.question_rounds where closed_at is null), true);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select lives_ok(
  $$ select public.submit_anonymous_question(current_setting('test.scholar_round_id')::bigint, 'Wann beginnt die Busfahrt?') $$,
  'participants can continue submitting anonymous questions'
);
reset role;
select set_config('test.scholar_question_id', (
  select id::text from public.anonymous_questions where round_id = current_setting('test.scholar_round_id')::bigint
), true);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select ok(public.can_manage_question_rounds(), 'scholars can manage questions');
select ok(not public.is_admin(), 'the scholar role does not confer general admin rights');
select is(
  (select count(*) from public.anonymous_questions where id = current_setting('test.scholar_question_id')::bigint),
  1::bigint, 'scholars can read anonymous questions'
);
select is((select count(*) from public.profiles), 1::bigint, 'scholars can read only their own profile');
select throws_ok(
  $$ select public.admin_list_users() $$, '42501', 'Admin access required.',
  'scholars cannot access the admin user list'
);
select throws_ok(
  $$ select public.admin_set_user_role('13000000-0000-0000-0000-000000000003', 'admin') $$,
  '42501', 'Admin access required.', 'scholars cannot assign roles'
);
select throws_ok(
  $$ select public.start_group_check('Unzulässige Abfrage?') $$,
  '42501', 'Admin access required.', 'scholars cannot start mandatory group checks'
);
select throws_ok(
  $$ select * from public.question_submission_limits $$,
  '42501', 'permission denied for table question_submission_limits',
  'scholars cannot read sender-linked submission counters'
);
select lives_ok(
  $$ select public.set_anonymous_question_checked(current_setting('test.scholar_question_id')::bigint, true) $$,
  'scholars can check off questions'
);
select ok(
  (select is_checked and checked_at is not null from public.anonymous_questions where id = current_setting('test.scholar_question_id')::bigint),
  'question completion is persisted'
);
select lives_ok(
  $$ select public.set_anonymous_question_checked(current_setting('test.scholar_question_id')::bigint, false) $$,
  'scholars can reopen a question'
);
select lives_ok(
  $$ select public.close_question_round(current_setting('test.scholar_round_id')::bigint) $$,
  'scholars can close an admin-opened round'
);
select is(
  (select count(*) from public.anonymous_questions where id = current_setting('test.scholar_question_id')::bigint),
  1::bigint, 'scholars can still read questions after the round closes'
);
reset role;
select is(
  (select count(*) from public.question_submission_limits where round_id = current_setting('test.scholar_round_id')::bigint),
  0::bigint, 'scholar closure removes temporary submission counters'
);

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select lives_ok($$ select public.open_question_round('brother') $$, 'scholars can start a new round');
select throws_ok(
  $$ select public.open_question_round('brother') $$, '23505', 'A question round is already open.',
  'scholars cannot open a second concurrent round'
);
reset role;
select set_config('test.scholar_round_id', (select id::text from public.question_rounds where closed_at is null), true);

-- Check both staff roles through RLS and the management RPCs.
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000004', true);
set local role authenticated;
select ok(not public.can_manage_question_rounds(), 'medical staff cannot manage questions');
select is((select count(*) from public.anonymous_questions), 0::bigint, 'medical staff cannot read question texts');
select throws_ok(
  $$ select public.open_question_round('brother') $$, '42501', 'Admin or scholar access required.',
  'medical staff cannot open rounds'
);
select throws_ok(
  $$ select public.close_question_round(current_setting('test.scholar_round_id')::bigint) $$,
  '42501', 'Admin or scholar access required.', 'medical staff cannot close rounds'
);
select throws_ok(
  $$ select public.set_anonymous_question_checked(current_setting('test.scholar_question_id')::bigint, true) $$,
  '42501', 'Admin or scholar access required.', 'medical staff cannot check off questions'
);
reset role;

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000005', true);
set local role authenticated;
select ok(not public.can_manage_question_rounds(), 'organization staff cannot manage questions');
select is((select count(*) from public.anonymous_questions), 0::bigint, 'organization staff cannot read question texts');
select throws_ok(
  $$ select public.open_question_round('brother') $$, '42501', 'Admin or scholar access required.',
  'organization staff cannot open rounds'
);
select throws_ok(
  $$ select public.close_question_round(current_setting('test.scholar_round_id')::bigint) $$,
  '42501', 'Admin or scholar access required.', 'organization staff cannot close rounds'
);
select throws_ok(
  $$ select public.set_anonymous_question_checked(current_setting('test.scholar_question_id')::bigint, true) $$,
  '42501', 'Admin or scholar access required.', 'organization staff cannot check off questions'
);
reset role;

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select is((select count(*) from public.anonymous_questions), 0::bigint, 'participants cannot read question texts');
select throws_ok(
  $$ select public.open_question_round('brother') $$, '42501', 'Admin or scholar access required.',
  'participants cannot open rounds'
);
select throws_ok(
  $$ select public.close_question_round(current_setting('test.scholar_round_id')::bigint) $$,
  '42501', 'Admin or scholar access required.', 'participants cannot close rounds'
);
select throws_ok(
  $$ select public.set_anonymous_question_checked(current_setting('test.scholar_question_id')::bigint, true) $$,
  '42501', 'Admin or scholar access required.', 'participants cannot check off questions'
);
reset role;

select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$ select public.admin_set_user_role('13000000-0000-0000-0000-000000000001', 'scholar') $$,
  'P0001', 'At least one administrator must remain.', 'the last admin cannot be demoted to scholar'
);
select lives_ok(
  $$ select public.admin_set_user_role('13000000-0000-0000-0000-000000000002', 'user') $$,
  'admins can revoke the scholar role'
);
reset role;
select set_config('request.jwt.claim.sub', '13000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.anonymous_questions), 0::bigint, 'revoked scholars immediately lose read access');
select throws_ok(
  $$ select public.close_question_round(current_setting('test.scholar_round_id')::bigint) $$,
  '42501', 'Admin or scholar access required.', 'revoked scholars immediately lose control of rounds'
);
reset role;

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok(
  $$ select public.open_question_round('brother') $$, '42501', 'Admin or scholar access required.',
  'question management also requires a valid authenticated account'
);
reset role;

select * from finish();
rollback;
