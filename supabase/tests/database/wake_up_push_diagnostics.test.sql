begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

-- Rollback-only fixtures. This test never invokes a dispatcher or sends a push.
insert into auth.users(id, email, raw_user_meta_data) values
  ('83000000-0000-0000-0000-000000000001', 'push-diagnostics@example.invalid', '{"display_name":"Push Diagnostics"}');
with device as (
  insert into public.push_notification_devices(profile_id, expo_push_token, platform)
  select id, 'ExpoPushToken[diagnosticfixture123456789]', 'ios'
  from public.profiles where user_id = '83000000-0000-0000-0000-000000000001'
  returning id
), call as (
  insert into public.wake_up_calls(message, scheduled_for, activated_at)
  values ('Diagnostic fixture', now(), now()) returning id
), attempt as (
  insert into public.wake_up_notification_attempts(call_id, device_id)
  select call.id, device.id from call, device returning id
)
select set_config('test.diagnostic_attempt', id::text, true) from attempt;

select ok(not has_table_privilege('anon', 'public.wake_up_notification_attempts', 'select'), 'anonymous clients cannot read diagnostics');
select ok(not has_table_privilege('authenticated', 'public.wake_up_notification_attempts', 'select'), 'authenticated clients including admins cannot read private diagnostics');
select ok(not has_table_privilege('authenticated', 'public.wake_up_notification_attempts', 'update'), 'clients cannot overwrite diagnostic results');

set local role service_role;
select lives_ok($$
  update public.wake_up_notification_attempts
  set accepted = false, completed_at = now(), error_code = 'InvalidCredentials', expo_http_status = 200
  where id = current_setting('test.diagnostic_attempt')::bigint
$$, 'the server can persist an individual Expo ticket error');
select is((select error_code from public.wake_up_notification_attempts where id = current_setting('test.diagnostic_attempt')::bigint), 'InvalidCredentials', 'the concrete Expo error survives a separate read');
select throws_ok($$
  update public.wake_up_notification_attempts set error_code = 'ExpoPushToken[private-token]'
  where id = current_setting('test.diagnostic_attempt')::bigint
$$, '23514', null, 'raw tokens cannot be persisted as error codes');
select throws_ok($$
  update public.wake_up_notification_attempts set expo_http_status = 999
  where id = current_setting('test.diagnostic_attempt')::bigint
$$, '23514', null, 'invalid HTTP statuses are rejected');
select lives_ok($$
  update public.wake_up_notification_attempts
  set accepted = true, error_code = null, expo_ticket_id = 'b853d128-3048-4c52-9d49-b81b4144bca5'
  where id = current_setting('test.diagnostic_attempt')::bigint
$$, 'the server can persist an accepted Expo receipt ID');
select is((select expo_ticket_id::text from public.wake_up_notification_attempts where id = current_setting('test.diagnostic_attempt')::bigint), 'b853d128-3048-4c52-9d49-b81b4144bca5', 'the receipt ID remains available without a token read');

reset role;
select * from finish();
rollback;
