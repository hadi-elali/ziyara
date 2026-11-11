begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users(id, email, raw_user_meta_data)
values
  ('87000000-0000-0000-0000-000000000001', 'battery-admin@example.invalid', '{"display_name":"Battery Admin"}'),
  ('87000000-0000-0000-0000-000000000002', 'battery-user@example.invalid', '{"display_name":"Battery User","is_battery_empty":true}'),
  ('87000000-0000-0000-0000-000000000003', 'battery-open@example.invalid', '{"display_name":"Battery Open"}');
update public.profiles set role = 'admin' where user_id = '87000000-0000-0000-0000-000000000001';
update public.profiles set party_size = 3 where user_id = '87000000-0000-0000-0000-000000000002';
update public.group_checks set closed_at = greatest(now(), created_at) where closed_at is null;

select col_not_null('public', 'profiles', 'is_battery_empty', 'empty-battery status cannot be null');
select is((select is_battery_empty from public.profiles where user_id = '87000000-0000-0000-0000-000000000002'), false, 'signup metadata cannot set empty-battery status');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'is_battery_empty', 'update'), 'clients cannot write the marker directly');
select ok(not has_column_privilege('anon', 'public.profiles', 'is_battery_empty', 'update'), 'anonymous callers cannot write the marker');
select ok(not has_function_privilege('anon', 'public.admin_set_user_battery_empty(uuid,boolean)', 'execute'), 'anonymous callers cannot use the RPC');
select ok(has_function_privilege('authenticated', 'public.admin_set_user_battery_empty(uuid,boolean)', 'execute'), 'authenticated callers can reach the role-checked RPC');

select set_config('request.jwt.claim.sub', '87000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',true)$$, '42501', 'Admin access required.', 'ordinary users cannot excuse themselves');
select throws_ok($$update public.profiles set is_battery_empty = true where user_id = '87000000-0000-0000-0000-000000000002'$$, '42501', null, 'direct self update is denied');
select throws_ok($$select * from public.admin_group_check_results(1)$$, '42501', 'Admin access required.', 'result empty-battery status data remains admin-only');

select set_config('request.jwt.claim.sub', '87000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.admin_set_user_battery_empty(null,true)$$, '22023', 'A user ID and battery status are required.', 'a missing target is rejected');
select throws_ok($$select public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',null)$$, '22023', 'A user ID and battery status are required.', 'a missing status is rejected');
select throws_ok($$select public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000099',true)$$, 'P0002', 'User profile not found.', 'unknown target is rejected');
select is(public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',true), true, 'admin marks an account as battery-empty');
select is(public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',true), true, 'repeated marking is harmless');
select is((select is_battery_empty from public.admin_list_users() where user_id = '87000000-0000-0000-0000-000000000002'), true, 'admin list exposes persisted empty-battery status');
select set_config('test.battery_check', (public.start_group_check('Alle bereit?')).id::text, true);
select is((select is_battery_empty from public.admin_group_check_results(current_setting('test.battery_check')::bigint) where display_name = 'Battery User'), true, 'battery-empty accounts are recognizable without a response');
select is((select answer from public.admin_group_check_results(current_setting('test.battery_check')::bigint) where display_name = 'Battery User'), null::boolean, 'marking empty-battery status does not fabricate an answer');
select is((select party_size from public.admin_group_check_results(current_setting('test.battery_check')::bigint) where display_name = 'Battery User'), 3::bigint, 'represented people remain available for empty-battery status counts');
select is((select is_battery_empty from public.admin_group_check_results(current_setting('test.battery_check')::bigint) where display_name = 'Battery Open'), false, 'other unanswered accounts remain ordinary open accounts');

select set_config('request.jwt.claim.sub', '87000000-0000-0000-0000-000000000002', true);
select is((select is_battery_empty from public.profiles where user_id = '87000000-0000-0000-0000-000000000002'), true, 'own profile exposes empty-battery status for client exemption');
select public.respond_to_group_check(current_setting('test.battery_check')::bigint, false);
select set_config('request.jwt.claim.sub', '87000000-0000-0000-0000-000000000001', true);
select is((select is_battery_empty and answer = false from public.admin_group_check_results(current_setting('test.battery_check')::bigint) where display_name = 'Battery User'), true, 'empty-battery status and the original answer remain separate');
-- The statuses replace each other through both old and new RPCs.
select public.admin_set_user_sick('87000000-0000-0000-0000-000000000002',true);
select is((select is_sick and not is_battery_empty from public.admin_list_users() where user_id='87000000-0000-0000-0000-000000000002'),true,'sickness replaces battery-empty status');
select public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',true);
select is((select is_battery_empty and not is_sick from public.admin_list_users() where user_id='87000000-0000-0000-0000-000000000002'),true,'battery-empty status replaces sickness');
reset role;
select throws_ok($$update public.profiles set is_sick=true, is_battery_empty=true where user_id='87000000-0000-0000-0000-000000000002'$$,'23514',null,'the database rejects conflicting statuses');
set local role authenticated;
select is(public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',false), false, 'admin clears empty-battery status');
select is((select not is_battery_empty and answer = false from public.admin_group_check_results(current_setting('test.battery_check')::bigint) where display_name = 'Battery User'), true, 'clearing restores the saved answer');

-- Check the push exemption after activation and before a device is claimed.
select public.close_group_check(current_setting('test.battery_check')::bigint);
reset role;
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
select id, 'ExpoPushToken[empty-battery status1234567890]', 'ios' from public.profiles where user_id = '87000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('test.battery_check', (public.start_group_check('Neue Abfrage?')).id::text, true);
select public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',true);
set local role service_role;
select * from public.claim_group_check_notifications(current_setting('test.battery_check')::bigint, '87000000-0000-0000-0000-000000000001');
select is((select count(*) from public.group_check_push_attempts where check_id = current_setting('test.battery_check')::bigint and error_code = 'recipient_battery_empty'), 1::bigint, 'battery-empty account is excluded from response reminder push');
reset role;
select is((select count(*) from public.group_check_responses where check_id = current_setting('test.battery_check')::bigint and profile_id = (select id from public.profiles where user_id = '87000000-0000-0000-0000-000000000002')), 0::bigint, 'new checks do not create answers for battery-empty accounts');
set local role authenticated;
select is(public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',false), false, 'empty-battery status can be cleared during a later check');
select is((select answer from public.admin_group_check_results(current_setting('test.battery_check')::bigint) where display_name = 'Battery User'), null::boolean, 'clearing during a new check requires a new answer');
select throws_ok($$select * from public.admin_group_check_results(999999999)$$, 'P0002', 'Group check not found.', 'unknown checks still fail');
reset role;
update public.profiles set role = 'scholar' where user_id = '87000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '87000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',true)$$, '42501', 'Admin access required.', 'scholars cannot change empty-battery status');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.admin_set_user_battery_empty('87000000-0000-0000-0000-000000000002',true)$$, '42501', 'Admin access required.', 'a session is required even with the execute grant');

select * from finish();
rollback;
