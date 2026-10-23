begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Rollback-only fixtures; this suite never invokes Expo or an Edge Function.
delete from public.push_notification_devices;
insert into auth.users(id, email, raw_user_meta_data) values
  ('84000000-0000-0000-0000-000000000001', 'broadcast-admin@example.invalid', '{"display_name":"Broadcast Admin","name":"Broadcast","surname":"Admin","age":30}'),
  ('84000000-0000-0000-0000-000000000002', 'broadcast-user@example.invalid', '{"display_name":"Broadcast User","name":"Broadcast","surname":"User","age":30}');
update public.profiles set role = 'admin' where user_id = '84000000-0000-0000-0000-000000000001';
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
  select id, 'ExpoPushToken[broadcastfixtureios00001]', 'ios' from public.profiles where user_id = '84000000-0000-0000-0000-000000000001';
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
  select id, 'ExpoPushToken[broadcastfixtureandroid01]', 'android' from public.profiles where user_id = '84000000-0000-0000-0000-000000000001';
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
  select id, 'ExpoPushToken[broadcastfixtureuser0001]', 'ios' from public.profiles where user_id = '84000000-0000-0000-0000-000000000002';

select ok(not has_table_privilege('authenticated', 'public.admin_push_notification_attempts', 'select'), 'clients cannot read device or recipient IDs');
select ok(not has_table_privilege('authenticated', 'public.admin_push_messages', 'insert'), 'clients cannot bypass the prepare RPC');
select ok(not has_table_privilege('anon', 'public.admin_push_messages', 'select'), 'anonymous clients cannot read messages');
select ok(not has_function_privilege('authenticated', 'public.claim_admin_push_notifications(bigint,uuid)', 'execute'), 'clients cannot claim tokens');
select ok(not has_function_privilege('anon', 'public.admin_prepare_push_message(text,text)', 'execute'), 'anonymous clients cannot prepare messages');
select ok(has_function_privilege('service_role', 'public.claim_admin_push_notifications(bigint,uuid)', 'execute'), 'server can claim tokens');

select set_config('request.jwt.claim.sub', '84000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.admin_prepare_push_message('Title','Body')$$, '42501', null, 'normal users cannot prepare a broadcast');
select throws_ok($$select * from public.admin_list_push_messages()$$, '42501', null, 'normal users cannot read broadcast history');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.admin_prepare_push_message('Title','Body')$$, '42501', null, 'missing session is rejected even as function owner');
select set_config('request.jwt.claim.sub', '84000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok($$select public.admin_prepare_push_message(' ','Body')$$, '23514', null, 'blank title rejected');
select throws_ok($$select public.admin_prepare_push_message('Title',' ')$$, '23514', null, 'blank message rejected');
select throws_ok($$select public.admin_prepare_push_message(repeat('a',101),'Body')$$, '23514', null, 'long title rejected');
select throws_ok($$select public.admin_prepare_push_message('Title',repeat('a',501))$$, '23514', null, 'long body rejected');
select set_config('test.broadcast_id', public.admin_prepare_push_message('  Treffpunkt  ','  Zur Rezeption kommen.  ')::text, true);
select is((select title from public.admin_list_push_messages() where id = current_setting('test.broadcast_id')::bigint), 'Treffpunkt', 'title trimmed and persisted');
select is((select body from public.admin_list_push_messages() where id = current_setting('test.broadcast_id')::bigint), 'Zur Rezeption kommen.', 'body trimmed and persisted');
select is((select total from public.admin_list_push_messages() where id = current_setting('test.broadcast_id')::bigint), 0::bigint, 'preview never dispatches');
reset role;
set local role service_role;
select throws_ok($$select * from public.claim_admin_push_notifications(current_setting('test.broadcast_id')::bigint,'84000000-0000-0000-0000-000000000002')$$, '42501', null, 'claim independently verifies the current admin role');
select throws_ok($$select * from public.claim_admin_push_notifications(-1,'84000000-0000-0000-0000-000000000001')$$, 'P0002', null, 'unknown message rejected');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.broadcast_id')::bigint,'84000000-0000-0000-0000-000000000001')), 3::bigint, 'all devices included: both platforms, admins and normal accounts');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.broadcast_id')::bigint,'84000000-0000-0000-0000-000000000001')), 0::bigint, 'repeated dispatch cannot reclaim attempts');
select is((select count(*) from public.admin_push_notification_attempts where message_id = current_setting('test.broadcast_id')::bigint and claimed_at is not null), 3::bigint, 'claims persisted before any network send');

update public.admin_push_notification_attempts set accepted = true, completed_at = now()
  where id = (select min(id) from public.admin_push_notification_attempts where message_id = current_setting('test.broadcast_id')::bigint);
update public.admin_push_notification_attempts set accepted = false, completed_at = now(), error_code = 'DeviceNotRegistered'
  where id = (select max(id) from public.admin_push_notification_attempts where message_id = current_setting('test.broadcast_id')::bigint);
select throws_ok($$update public.admin_push_notification_attempts set error_code = 'ExpoPushToken[secret]' where message_id = current_setting('test.broadcast_id')::bigint$$, '23514', null, 'diagnostics reject raw tokens');
delete from public.push_notification_devices where expo_push_token = 'ExpoPushToken[broadcastfixtureuser0001]';
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
  select id, 'ExpoPushToken[broadcastfixturelater001]', 'ios' from public.profiles where user_id = '84000000-0000-0000-0000-000000000002';
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.broadcast_id')::bigint,'84000000-0000-0000-0000-000000000001')), 0::bigint, 'late registration cannot receive an earlier message');
reset role;
set local role authenticated;
select is((select total from public.admin_list_push_messages() where id = current_setting('test.broadcast_id')::bigint), 3::bigint, 'unregistering preserves original totals');
select is((select accepted from public.admin_list_push_messages() where id = current_setting('test.broadcast_id')::bigint), 1::bigint, 'accepted count remains visible after a fresh read');
select is((select failed from public.admin_list_push_messages() where id = current_setting('test.broadcast_id')::bigint), 1::bigint, 'failed count remains distinct');
select is((select pending from public.admin_list_push_messages() where id = current_setting('test.broadcast_id')::bigint), 1::bigint, 'uncertain claimed attempt stays pending');

select set_config('test.batch_id', public.admin_prepare_push_message('Batch','Test')::text, true);
reset role;
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
  select p.id, 'ExpoPushToken[broadcastbatchfixture'||n||']', 'android'
  from public.profiles p cross join generate_series(1,101) n where p.user_id = '84000000-0000-0000-0000-000000000002';
set local role service_role;
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.batch_id')::bigint,'84000000-0000-0000-0000-000000000001')), 100::bigint, 'claim batch limited to 100');
-- Remove and reassign devices before claiming the remaining snapshot.
delete from public.push_notification_devices where expo_push_token = 'ExpoPushToken[broadcastbatchfixture101]';
update public.push_notification_devices set profile_id = (select id from public.profiles where user_id = '84000000-0000-0000-0000-000000000001')
  where expo_push_token = 'ExpoPushToken[broadcastbatchfixture100]';
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.batch_id')::bigint,'84000000-0000-0000-0000-000000000001')), 2::bigint, 'remaining batch excludes removed and reassigned devices');
select is((select count(*) from public.admin_push_notification_attempts where message_id = current_setting('test.batch_id')::bigint and error_code = 'device_unregistered'), 2::bigint, 'removed devices recorded without deleting history');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.batch_id')::bigint,'84000000-0000-0000-0000-000000000001')), 0::bigint, 'all batches remain idempotent');
reset role;

-- Empty snapshots stay empty even if devices are registered later.
delete from public.push_notification_devices;
set local role authenticated;
select set_config('test.empty_id', public.admin_prepare_push_message('Empty','Test')::text, true);
reset role;
set local role service_role;
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.empty_id')::bigint,'84000000-0000-0000-0000-000000000001')), 0::bigint, 'empty recipient set is valid');
reset role;
set local role authenticated;
select ok((select started_at is not null from public.admin_list_push_messages() where id = current_setting('test.empty_id')::bigint), 'zero-device dispatch recorded as started, not draft');
reset role;
update public.profiles set role = 'admin' where user_id = '84000000-0000-0000-0000-000000000002';
update public.profiles set role = 'user' where user_id = '84000000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok($$select * from public.claim_admin_push_notifications(current_setting('test.empty_id')::bigint,'84000000-0000-0000-0000-000000000001')$$, '42501', null, 'revoked admin role prevents continuation');
reset role;

select * from finish();
rollback;
