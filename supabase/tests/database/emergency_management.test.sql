begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(not has_function_privilege('anon', 'public.complete_emergency_request(bigint)', 'execute'), 'anonymous completion denied');
select ok(not has_function_privilege('anon', 'public.admin_delete_emergency_request(bigint)', 'execute'), 'anonymous deletion denied');
select ok(has_function_privilege('authenticated', 'public.complete_emergency_request(bigint)', 'execute'), 'authenticated completion RPC available');
select ok(has_function_privilege('authenticated', 'public.admin_delete_emergency_request(bigint)', 'execute'), 'authenticated deletion RPC available with internal admin check');
select ok(not has_table_privilege('authenticated', 'public.emergency_requests', 'update'), 'direct updates remain denied');
select ok(not has_table_privilege('authenticated', 'public.emergency_requests', 'delete'), 'direct deletes remain denied');

insert into auth.users (id, email, raw_user_meta_data)
values
  ('79000000-0000-0000-0000-000000000001', 'em-management-admin@example.invalid', '{"display_name":"Test Admin"}'),
  ('79000000-0000-0000-0000-000000000002', 'em-management-sender@example.invalid', '{"display_name":"Test Sender"}'),
  ('79000000-0000-0000-0000-000000000003', 'em-management-medical@example.invalid', '{"display_name":"Test Medical"}'),
  ('79000000-0000-0000-0000-000000000004', 'em-management-travel@example.invalid', '{"display_name":"Test Travel"}'),
  ('79000000-0000-0000-0000-000000000005', 'em-management-scholar@example.invalid', '{"display_name":"Test Scholar"}');

update public.profiles set role = case user_id
  when '79000000-0000-0000-0000-000000000001'::uuid then 'admin'::public.app_role
  when '79000000-0000-0000-0000-000000000003'::uuid then 'medical_staff'::public.app_role
  when '79000000-0000-0000-0000-000000000004'::uuid then 'organization_team'::public.app_role
  when '79000000-0000-0000-0000-000000000005'::uuid then 'scholar'::public.app_role
  else role end
where user_id::text like '79000000-%';

create temporary table test_emergencies (name text primary key, id int8, completed_at timestamptz);
grant select, update, insert on test_emergencies to authenticated;

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000002', true);
set local role authenticated;
insert into test_emergencies (name, id)
select 'medical', request_id from public.submit_emergency_request('medical', 'Medical test request', 'Test lobby');
insert into test_emergencies (name, id)
select 'travel', request_id from public.submit_emergency_request('travel', 'Travel test request', 'Test bus');
insert into test_emergencies (name, id)
select 'admin-medical', request_id from public.submit_emergency_request('medical', 'Admin medical test', 'Test lobby');
insert into test_emergencies (name, id)
select 'admin-travel', request_id from public.submit_emergency_request('travel', 'Admin travel test', 'Test bus');

select is((select count(*)::int from public.emergency_requests where id in (select id from test_emergencies) and completed_at is null and completed_by_profile_id is null), 4, 'new emergencies are open');
select throws_ok($$select public.complete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Emergency team access required.', 'sender cannot complete own emergency');
select throws_ok($$select public.admin_delete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Admin access required.', 'sender cannot delete own emergency');

select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.complete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Emergency team access required.', 'completion requires identity even with authenticated DB role');
select throws_ok($$select public.admin_delete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Admin access required.', 'deletion requires identity even with authenticated DB role');

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000005', true);
select throws_ok($$select public.complete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Emergency team access required.', 'scholar cannot complete emergencies');
select throws_ok($$select public.admin_delete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Admin access required.', 'scholar cannot delete emergencies');

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.complete_emergency_request((select id from test_emergencies where name = 'travel'))$$, '42501', 'Emergency team access required.', 'medical staff cannot complete travel emergencies');
select throws_ok($$select public.admin_delete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Admin access required.', 'medical staff cannot delete emergencies');
update test_emergencies set completed_at = public.complete_emergency_request(id) where name = 'medical';
select ok((select completed_at is not null from test_emergencies where name = 'medical'), 'medical staff completes matching emergency');
select is((select completed_at from public.list_my_emergency_messages() where request_id = (select id from test_emergencies where name = 'medical')), (select completed_at from test_emergencies where name = 'medical'), 'inbox exposes shared completion');
select is((select completed_at from public.list_emergency_dashboard() where request_id = (select id from test_emergencies where name = 'medical')), (select completed_at from test_emergencies where name = 'medical'), 'dashboard exposes shared completion');
select ok((select read_at is null from public.list_my_emergency_messages() where request_id = (select id from test_emergencies where name = 'medical')), 'completion preserves personal read status');
select is(public.complete_emergency_request((select id from test_emergencies where name = 'medical')), (select completed_at from test_emergencies where name = 'medical'), 'repeated completion preserves timestamp');
select is((select count(*)::int from public.list_emergency_dashboard() where target_team = 'travel'), 0, 'medical dashboard stays team scoped');

-- Mirrors the inner join and null filters used by the Home indicator.
select is((select count(*)::int from public.emergency_request_recipients r join public.emergency_requests e on e.id = r.request_id where r.read_at is null and e.completed_at is null and e.id in (select id from test_emergencies)), 1, 'unread active count excludes completed emergencies');

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000004', true);
select throws_ok($$select public.complete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Emergency team access required.', 'travel staff cannot complete medical emergencies including closed cases');
select throws_ok($$select public.admin_delete_emergency_request((select id from test_emergencies where name = 'travel'))$$, '42501', 'Admin access required.', 'travel staff cannot delete emergencies');
select ok(public.complete_emergency_request((select id from test_emergencies where name = 'travel')) is not null, 'travel staff completes matching emergency');

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select ok(public.complete_emergency_request((select id from test_emergencies where name = 'admin-medical')) is not null, 'admin completes medical emergency');
select ok(public.complete_emergency_request((select id from test_emergencies where name = 'admin-travel')) is not null, 'admin completes travel emergency');
select is(public.complete_emergency_request((select id from test_emergencies where name = 'medical')), (select completed_at from test_emergencies where name = 'medical'), 'another actor cannot replace original completion timestamp');
select throws_ok($$select public.complete_emergency_request(-1)$$, 'P0002', 'Emergency request not found.', 'missing completion target reported');
select throws_ok($$select public.admin_delete_emergency_request(-1)$$, 'P0002', 'Emergency request not found.', 'missing delete target reported');

reset role;
select is((select completed_by_profile_id from public.emergency_requests where id = (select id from test_emergencies where name = 'medical')), (select id from public.profiles where user_id = '79000000-0000-0000-0000-000000000003'), 'original completion actor is retained');

-- Seed a private push log to verify the full delete cascade without sending push.
insert into public.push_notification_devices (profile_id, expo_push_token, platform)
select id, 'ExpoPushToken[emergency-management-test]', 'ios' from public.profiles where user_id = '79000000-0000-0000-0000-000000000003';
insert into public.emergency_notification_attempts (request_id, recipient_profile_id, push_device_id)
select e.id, p.id, d.id from test_emergencies e
join public.profiles p on p.user_id = '79000000-0000-0000-0000-000000000003'
join public.push_notification_devices d on d.profile_id = p.id and d.expo_push_token = 'ExpoPushToken[emergency-management-test]'
where e.name = 'medical';
select is((select count(*)::int from public.emergency_notification_attempts where request_id = (select id from test_emergencies where name = 'medical')), 1, 'private push log fixture exists');

-- A materialized recipient who loses their team role loses completion rights.
update public.profiles set role = 'user' where user_id = '79000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
set local role authenticated;
select throws_ok($$select public.complete_emergency_request((select id from test_emergencies where name = 'medical'))$$, '42501', 'Emergency team access required.', 'current role controls completion despite old recipient row');

-- Existing completion remains valid if its actor later deletes their account.
reset role;
delete from auth.users where id = '79000000-0000-0000-0000-000000000003';
select ok((select completed_at is not null and completed_by_profile_id is null from public.emergency_requests where id = (select id from test_emergencies where name = 'medical')), 'completion survives actor deletion');

-- Recreate a private attempt for an admin recipient after that account cascade.
insert into public.push_notification_devices (profile_id, expo_push_token, platform)
select id, 'ExpoPushToken[emergency-admin-delete-test]', 'ios' from public.profiles where user_id = '79000000-0000-0000-0000-000000000001';
insert into public.emergency_notification_attempts (request_id, recipient_profile_id, push_device_id)
select e.id, p.id, d.id from test_emergencies e
join public.profiles p on p.user_id = '79000000-0000-0000-0000-000000000001'
join public.push_notification_devices d on d.profile_id = p.id and d.expo_push_token = 'ExpoPushToken[emergency-admin-delete-test]'
where e.name = 'medical';

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.admin_delete_emergency_request((select id from test_emergencies where name = 'medical'))$$, 'admin deletes completed emergency');
select is((select count(*)::int from public.list_emergency_dashboard() where request_id = (select id from test_emergencies where name = 'medical')), 0, 'deleted emergency disappears from dashboard');
reset role;
select is((select count(*)::int from public.emergency_requests where id = (select id from test_emergencies where name = 'medical')), 0, 'emergency permanently deleted');
select is((select count(*)::int from public.emergency_request_recipients where request_id = (select id from test_emergencies where name = 'medical')), 0, 'recipient rows cascade');
select is((select count(*)::int from public.emergency_notification_attempts where request_id = (select id from test_emergencies where name = 'medical')), 0, 'private push attempts cascade');

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*)::int from public.emergency_requests where id = (select id from test_emergencies where name = 'medical')), 0, 'deleted emergency disappears for sender');
insert into test_emergencies (name, id)
select 'open-delete', request_id from public.submit_emergency_request('travel', 'Open delete test request', 'Test bus');
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.admin_delete_emergency_request((select id from test_emergencies where name = 'open-delete'))$$, 'admin can also delete an open emergency');

select * from finish();
rollback;
