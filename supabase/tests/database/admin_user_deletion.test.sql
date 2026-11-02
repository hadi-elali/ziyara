begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(not has_function_privilege('anon', 'public.admin_delete_user(uuid)', 'execute'), 'anonymous callers cannot delete users');
select ok(has_function_privilege('authenticated', 'public.admin_delete_user(uuid)', 'execute'), 'authenticated callers can reach the guarded deletion RPC');
select ok(not has_table_privilege('authenticated', 'auth.users', 'delete'), 'clients cannot delete Auth rows directly');

insert into auth.users(id, email, raw_user_meta_data) values
  ('a2000000-0000-0000-0000-000000000001', 'delete-admin@example.invalid', '{"display_name":"Deletion Admin"}'),
  ('a2000000-0000-0000-0000-000000000002', 'delete-other-admin@example.invalid', '{"display_name":"Other Admin"}'),
  ('a2000000-0000-0000-0000-000000000003', 'delete-target@example.invalid', '{"display_name":"Deletion Target"}'),
  ('a2000000-0000-0000-0000-000000000004', 'delete-unrelated@example.invalid', '{"display_name":"Unrelated User"}'),
  ('a2000000-0000-0000-0000-000000000005', 'delete-medical@example.invalid', '{"display_name":"Medical User"}'),
  ('a2000000-0000-0000-0000-000000000006', 'delete-organization@example.invalid', '{"display_name":"Organization User"}'),
  ('a2000000-0000-0000-0000-000000000007', 'delete-scholar@example.invalid', '{"display_name":"Scholar User"}');
update public.profiles set role = case right(user_id::text, 1)
  when '1' then 'admin'::public.app_role when '2' then 'admin'::public.app_role
  when '5' then 'medical_staff'::public.app_role when '6' then 'organization_team'::public.app_role
  when '7' then 'scholar'::public.app_role else 'user'::public.app_role end
where user_id::text like 'a2000000-%';

-- Every device session and refresh token must be revoked by the Auth cascade.
insert into auth.sessions(id, user_id) values
  ('a2100000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003'),
  ('a2100000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003'),
  ('a2100000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000004');
insert into auth.refresh_tokens(token, user_id, session_id) values
  ('admin-deletion-fixture-device-one', 'a2000000-0000-0000-0000-000000000003', 'a2100000-0000-0000-0000-000000000001'),
  ('admin-deletion-fixture-device-two', 'a2000000-0000-0000-0000-000000000003', 'a2100000-0000-0000-0000-000000000002');
insert into auth.identities(id, provider_id, user_id, identity_data, provider) values
  ('a2200000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003',
    'a2000000-0000-0000-0000-000000000003', '{"sub":"a2000000-0000-0000-0000-000000000003"}', 'email');

insert into public.account_families(id, name, created_by_profile_id) overriding system value
  select 982000000000000001, 'Deletion Family', id from public.profiles
  where user_id = 'a2000000-0000-0000-0000-000000000003';
update public.profiles set family_id = 982000000000000001
  where user_id in ('a2000000-0000-0000-0000-000000000003', 'a2000000-0000-0000-0000-000000000004');
insert into public.role_assignment_audit(changed_by_profile_id, target_user_id, previous_role, new_role, created_at)
  select id, user_id, 'user', 'medical_staff', '2000-02-01 00:00:00+00'::timestamptz
  from public.profiles where user_id = 'a2000000-0000-0000-0000-000000000003';
insert into public.push_notification_devices(id, profile_id, expo_push_token, platform) overriding system value
  select 982000000000000001, id, 'ExpoPushToken[admin-deletion-fixture]', 'ios'
  from public.profiles where user_id = 'a2000000-0000-0000-0000-000000000003';
insert into public.admin_push_messages(id, title, body, created_by_profile_id) overriding system value
  select 982000000000000001, 'Retained message', 'Retained body', id
  from public.profiles where user_id = 'a2000000-0000-0000-0000-000000000003';
insert into public.admin_push_notification_attempts(message_id, device_id, recipient_profile_id)
  select 982000000000000001, 982000000000000001, id
  from public.profiles where user_id = 'a2000000-0000-0000-0000-000000000003';

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok($$select public.admin_delete_user('a2000000-0000-0000-0000-000000000003')$$,
  '42501', 'Admin access required.', 'missing caller identity is rejected');
reset role;

-- All staff roles are denied, as is an ordinary account.
select set_config('request.jwt.claim.sub', user_id::text, true),
  throws_ok($$select public.admin_delete_user('a2000000-0000-0000-0000-000000000003')$$,
    '42501', 'Admin access required.', 'non-admin role cannot delete another account')
from public.profiles where user_id::text like 'a2000000-%' and role <> 'admin';

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok($$select public.admin_delete_user(null)$$,
  '22023', 'A user ID is required.', 'missing target is rejected');
select throws_ok($$select public.admin_delete_user('a2000000-0000-0000-0000-000000000001')$$,
  '22023', 'Administrators cannot delete their own account here.', 'dashboard cannot delete its own administrator');
select throws_ok($$select public.admin_delete_user('a2000000-0000-0000-0000-000000000099')$$,
  'P0002', 'User account not found.', 'unknown target is rejected');
select is(public.admin_delete_user('a2000000-0000-0000-0000-000000000003'),
  'a2000000-0000-0000-0000-000000000003'::uuid, 'admin deletes exactly the requested account');
select throws_ok($$select public.admin_delete_user('a2000000-0000-0000-0000-000000000003')$$,
  'P0002', 'User account not found.', 'duplicate deletion is not reported as success');
reset role;

select is((select count(*) from auth.users where id = 'a2000000-0000-0000-0000-000000000003'), 0::bigint, 'deleted Auth account is removed');
select is((select count(*) from public.profiles where user_id = 'a2000000-0000-0000-0000-000000000003'), 0::bigint, 'deleted profile is removed');
select is((select count(*) from auth.sessions where user_id = 'a2000000-0000-0000-0000-000000000003'), 0::bigint, 'sessions on all devices are removed');
select is((select count(*) from auth.refresh_tokens where user_id = 'a2000000-0000-0000-0000-000000000003'), 0::bigint, 'deleted account cannot refresh any device session');
select is((select count(*) from auth.identities where user_id = 'a2000000-0000-0000-0000-000000000003'), 0::bigint, 'deleted login identities are removed');
select is((select count(*) from auth.sessions where user_id = 'a2000000-0000-0000-0000-000000000004'), 1::bigint, 'unrelated session remains active');
select is((select count(*) from public.profiles where user_id = 'a2000000-0000-0000-0000-000000000004' and family_id = 982000000000000001), 1::bigint, 'other family member retains their account and family');
select ok((select created_by_profile_id is null from public.account_families where id = 982000000000000001), 'family is retained without its deleted creator reference');
select ok((select changed_by_profile_id is null and target_user_id is null from public.role_assignment_audit
  where created_at = '2000-02-01 00:00:00+00'::timestamptz), 'retained role history is anonymized');
select is((select count(*) from public.push_notification_devices where id = 982000000000000001), 0::bigint, 'deleted account no longer receives push notifications');
select ok((select created_by_profile_id is null from public.admin_push_messages where id = 982000000000000001), 'sent notification history retains no deleted creator reference');
select ok((select device_id is null and recipient_profile_id is null from public.admin_push_notification_attempts
  where message_id = 982000000000000001), 'retained push attempts do not block account deletion');

select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is(public.admin_delete_user('a2000000-0000-0000-0000-000000000002'),
  'a2000000-0000-0000-0000-000000000002'::uuid, 'admin can delete another administrator while remaining present');
reset role;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.admin_delete_user('a2000000-0000-0000-0000-000000000004')$$,
  '42501', 'Admin access required.', 'a deleted administrator cannot use an outstanding JWT to delete accounts');
reset role;

-- The authoritative Auth trigger is unchanged and still protects the final admin.
select throws_ok($$delete from auth.users where id = 'a2000000-0000-0000-0000-000000000001'$$,
  'P0001', 'The last administrator cannot delete their account.', 'transactional final-admin protection remains active');
update public.profiles set role = 'user' where user_id = 'a2000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok($$select public.admin_delete_user('a2000000-0000-0000-0000-000000000004')$$,
  '42501', 'Admin access required.', 'demoted administrators cannot delete with their existing JWT');
reset role;

select * from finish();
rollback;
