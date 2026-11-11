begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users(id, email, raw_user_meta_data)
values
  ('86000000-0000-0000-0000-000000000001', 'sick-admin@example.invalid', '{"display_name":"Sickness Admin"}'),
  ('86000000-0000-0000-0000-000000000002', 'sick-user@example.invalid', '{"display_name":"Sickness User","is_sick":true}'),
  ('86000000-0000-0000-0000-000000000003', 'sick-open@example.invalid', '{"display_name":"Sickness Open"}');
update public.profiles set role = 'admin' where user_id = '86000000-0000-0000-0000-000000000001';
update public.profiles set party_size = 3 where user_id = '86000000-0000-0000-0000-000000000002';
update public.group_checks set closed_at = greatest(now(), created_at) where closed_at is null;

select col_not_null('public', 'profiles', 'is_sick', 'sickness cannot be null');
select is((select is_sick from public.profiles where user_id = '86000000-0000-0000-0000-000000000002'), false, 'signup metadata cannot set sickness');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'is_sick', 'update'), 'clients cannot write the marker directly');
select ok(not has_column_privilege('anon', 'public.profiles', 'is_sick', 'update'), 'anonymous callers cannot write the marker');
select ok(not has_function_privilege('anon', 'public.admin_set_user_sick(uuid,boolean)', 'execute'), 'anonymous callers cannot use the RPC');
select ok(has_function_privilege('authenticated', 'public.admin_set_user_sick(uuid,boolean)', 'execute'), 'authenticated callers can reach the role-checked RPC');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',true)$$, '42501', 'Admin access required.', 'ordinary users cannot excuse themselves');
select throws_ok($$update public.profiles set is_sick = true where user_id = '86000000-0000-0000-0000-000000000002'$$, '42501', null, 'direct self update is denied');
select throws_ok($$select * from public.admin_group_check_results(1)$$, '42501', 'Admin access required.', 'result sickness data remains admin-only');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.admin_set_user_sick(null,true)$$, '22023', 'A user ID and sickness status are required.', 'a missing target is rejected');
select throws_ok($$select public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',null)$$, '22023', 'A user ID and sickness status are required.', 'a missing status is rejected');
select throws_ok($$select public.admin_set_user_sick('86000000-0000-0000-0000-000000000099',true)$$, 'P0002', 'User profile not found.', 'unknown target is rejected');
select is(public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',true), true, 'admin marks an account as sick');
select is(public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',true), true, 'repeated marking is harmless');
select is((select is_sick from public.admin_list_users() where user_id = '86000000-0000-0000-0000-000000000002'), true, 'admin list exposes persisted sickness');
select set_config('test.sick_check', (public.start_group_check('Alle bereit?')).id::text, true);
select is((select is_sick from public.admin_group_check_results(current_setting('test.sick_check')::bigint) where display_name = 'Sickness User'), true, 'sick accounts are recognizable without a response');
select is((select answer from public.admin_group_check_results(current_setting('test.sick_check')::bigint) where display_name = 'Sickness User'), null::boolean, 'marking sickness does not fabricate an answer');
select is((select party_size from public.admin_group_check_results(current_setting('test.sick_check')::bigint) where display_name = 'Sickness User'), 3::bigint, 'represented people remain available for sickness counts');
select is((select is_sick from public.admin_group_check_results(current_setting('test.sick_check')::bigint) where display_name = 'Sickness Open'), false, 'other unanswered accounts remain ordinary open accounts');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
select is((select is_sick from public.profiles where user_id = '86000000-0000-0000-0000-000000000002'), true, 'own profile exposes sickness for client exemption');
select public.respond_to_group_check(current_setting('test.sick_check')::bigint, false);
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select is((select is_sick and answer = false from public.admin_group_check_results(current_setting('test.sick_check')::bigint) where display_name = 'Sickness User'), true, 'sickness and the original answer remain separate');
select is(public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',false), false, 'admin clears sickness');
select is((select not is_sick and answer = false from public.admin_group_check_results(current_setting('test.sick_check')::bigint) where display_name = 'Sickness User'), true, 'clearing restores the saved answer');

-- Check the push exemption after activation and before a device is claimed.
select public.close_group_check(current_setting('test.sick_check')::bigint);
reset role;
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
select id, 'ExpoPushToken[sickness1234567890]', 'ios' from public.profiles where user_id = '86000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('test.sick_check', (public.start_group_check('Neue Abfrage?')).id::text, true);
select public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',true);
set local role service_role;
select * from public.claim_group_check_notifications(current_setting('test.sick_check')::bigint, '86000000-0000-0000-0000-000000000001');
select is((select count(*) from public.group_check_push_attempts where check_id = current_setting('test.sick_check')::bigint and error_code = 'recipient_sick'), 1::bigint, 'sick account is excluded from response reminder push');
reset role;
select is((select count(*) from public.group_check_responses where check_id = current_setting('test.sick_check')::bigint and profile_id = (select id from public.profiles where user_id = '86000000-0000-0000-0000-000000000002')), 0::bigint, 'new checks do not create answers for sick accounts');
set local role authenticated;
select is(public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',false), false, 'sickness can be cleared during a later check');
select is((select answer from public.admin_group_check_results(current_setting('test.sick_check')::bigint) where display_name = 'Sickness User'), null::boolean, 'clearing during a new check requires a new answer');
select throws_ok($$select * from public.admin_group_check_results(999999999)$$, 'P0002', 'Group check not found.', 'unknown checks still fail');
reset role;
update public.profiles set role = 'scholar' where user_id = '86000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',true)$$, '42501', 'Admin access required.', 'scholars cannot change sickness');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.admin_set_user_sick('86000000-0000-0000-0000-000000000002',true)$$, '42501', 'Admin access required.', 'a session is required even with the execute grant');

select * from finish();
rollback;
