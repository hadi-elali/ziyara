begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  not has_function_privilege('anon', 'public.open_question_round(public.member_type)', 'execute')
  and not has_function_privilege('anon', 'public.submit_anonymous_question(bigint, text)', 'execute'),
  'anonymous callers cannot open or submit to targeted rounds'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'member_type', 'update')
  and not has_table_privilege('authenticated', 'public.question_rounds', 'insert,update,delete'),
  'clients cannot change their assignment or bypass round RPCs'
);

-- Isolate fixtures only within this rolled-back transaction.
update public.question_rounds set closed_at = now() where closed_at is null;
insert into auth.users (id, email, raw_user_meta_data) values
  ('22030000-0000-0000-0000-000000000001', 'audience-admin@example.invalid', '{"display_name":"Audience Admin","member_type":"brother"}'),
  ('22030000-0000-0000-0000-000000000002', 'audience-scholar@example.invalid', '{"display_name":"Audience Scholar","member_type":"sister"}'),
  ('22030000-0000-0000-0000-000000000003', 'audience-brother@example.invalid', '{"display_name":"Audience Brother","member_type":"brother"}'),
  ('22030000-0000-0000-0000-000000000004', 'audience-sister@example.invalid', '{"display_name":"Audience Sister","member_type":"sister"}'),
  ('22030000-0000-0000-0000-000000000005', 'audience-unknown@example.invalid', '{"display_name":"Audience Unknown"}');
update public.profiles set role = 'admin' where user_id = '22030000-0000-0000-0000-000000000001';
update public.profiles set role = 'scholar' where user_id = '22030000-0000-0000-0000-000000000002';

select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$ select public.open_question_round() $$, '22023',
  'Bitte wähle Brüder oder Schwestern für die Fragerunde aus.',
  'older clients cannot open an unrestricted round'
);
select throws_ok(
  $$ select public.open_question_round(null::public.member_type) $$, '22023',
  'Bitte wähle Brüder oder Schwestern für die Fragerunde aus.',
  'an explicit audience is mandatory'
);
select lives_ok($$ select public.open_question_round('brother') $$, 'admins can open a brothers round');
reset role;
select set_config('test.audience_round_id', (select id::text from public.question_rounds where closed_at is null), true);
select is(
  (select target_member_type::text from public.question_rounds where id = current_setting('test.audience_round_id')::bigint),
  'brother', 'the selected audience is persisted'
);

select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000004', true);
set local role authenticated;
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Nicht zugelassene Frage?') $$,
  '42501', 'An dieser Fragerunde können nur Brüder Fragen stellen.',
  'sisters cannot bypass the client and submit to a brothers round'
);
select throws_ok(
  $$ select public.open_question_round('sister') $$, '42501', 'Admin or scholar access required.',
  'participants cannot open targeted rounds'
);
reset role;
select is(
  (select count(*) from public.question_submission_limits where round_id = current_setting('test.audience_round_id')::bigint),
  0::bigint, 'rejected submissions create no private counter'
);
select is(
  (select count(*) from public.anonymous_questions where round_id = current_setting('test.audience_round_id')::bigint),
  0::bigint, 'rejected submissions create no question'
);

select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000005', true);
set local role authenticated;
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Ohne Zuordnung?') $$,
  '42501', 'Für dein Konto ist keine Zuordnung als Bruder oder Schwester hinterlegt.',
  'legacy accounts without an assignment cannot submit'
);
reset role;
select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000009', true);
set local role authenticated;
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Ohne Profil?') $$,
  '42501', 'A user profile is required to submit questions.', 'a missing profile cannot submit'
);
reset role;

select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000003', true);
set local role authenticated;
select lives_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Wann treffen wir uns?') $$,
  'a matching brother can submit'
);
reset role;
select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Frage der Gelehrten?') $$,
  '42501', 'An dieser Fragerunde können nur Brüder Fragen stellen.',
  'scholar management rights do not bypass the audience'
);
select is(
  (select count(*) from public.anonymous_questions where round_id = current_setting('test.audience_round_id')::bigint),
  1::bigint, 'a scholar can still read questions from either audience'
);
select lives_ok(
  $$ select public.close_question_round(current_setting('test.audience_round_id')::bigint) $$,
  'a sister scholar can manage and close a brothers round'
);
select lives_ok($$ select public.open_question_round('sister') $$, 'scholars can open a sisters round');
reset role;
select set_config('test.audience_round_id', (select id::text from public.question_rounds where closed_at is null), true);

select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Adminfrage?') $$,
  '42501', 'An dieser Fragerunde können nur Schwestern Fragen stellen.',
  'admins cannot bypass the audience when submitting questions'
);
select throws_ok(
  $$ select public.open_question_round('brother') $$, '23505', 'A question round is already open.',
  'the existing single-open-round constraint is preserved across audiences'
);
reset role;

select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000004', true);
set local role authenticated;
select lives_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Frage einer Schwester?') $$,
  'a matching sister can submit'
);
reset role;
select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000002', true);
set local role authenticated;
select lives_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Passende Gelehrtenfrage?') $$,
  'a scholar with the matching assignment can also participate'
);
select lives_ok(
  $$ select public.close_question_round(current_setting('test.audience_round_id')::bigint) $$,
  'targeted rounds still close through the normal management RPC'
);
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Zu späte Frage?') $$,
  'P0002', 'Open question round not found.', 'closed rounds reject matching accounts too'
);
reset role;
select is(
  (select count(*) from public.question_submission_limits where round_id = current_setting('test.audience_round_id')::bigint),
  0::bigint, 'closing a targeted round clears private counters'
);
select is(
  (select count(*) from public.anonymous_questions where round_id = current_setting('test.audience_round_id')::bigint),
  2::bigint, 'closing preserves anonymous questions'
);

-- Preserve untargeted historical rounds without inventing an audience.
insert into public.question_rounds default values;
select set_config('test.audience_round_id', (select id::text from public.question_rounds where closed_at is null), true);
select set_config('request.jwt.claim.sub', '22030000-0000-0000-0000-000000000003', true);
set local role authenticated;
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Frage in alter Runde?') $$,
  '42501', 'Für diese Fragerunde muss zuerst eine Zielgruppe festgelegt werden.',
  'untargeted legacy rounds fail closed'
);
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok(
  $$ select public.submit_anonymous_question(current_setting('test.audience_round_id')::bigint, 'Ohne Anmeldung?') $$,
  '42501', 'Authentication required.', 'a valid session is still required'
);
reset role;

select * from finish();
rollback;
