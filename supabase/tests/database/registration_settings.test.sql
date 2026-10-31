begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('89000000-0000-0000-0000-000000000001', 'registration-admin@example.invalid', '{"display_name":"Registration Admin","name":"Registration","surname":"Admin","age":30}'),
  ('89000000-0000-0000-0000-000000000002', 'registration-user@example.invalid', '{"display_name":"Registration User","name":"Registration","surname":"User","age":30}');
update public.profiles set role = 'admin' where user_id = '89000000-0000-0000-0000-000000000001';

select ok(public.get_registration_enabled(), 'registration starts enabled');
select ok(not has_table_privilege('anon', 'public.registration_settings', 'select'), 'anonymous clients only read the public getter');
select ok(not has_table_privilege('authenticated', 'public.registration_settings', 'update'), 'clients cannot bypass admin RPC');
select ok(not has_table_privilege('authenticated', 'public.registration_settings', 'insert'), 'clients cannot replace the singleton');
select ok(not has_table_privilege('authenticated', 'public.registration_settings', 'delete'), 'clients cannot delete the singleton');
select ok(not has_function_privilege('anon', 'public.admin_set_registration_enabled(boolean)', 'execute'), 'anonymous callers cannot toggle registration');
select ok(not has_function_privilege('authenticated', 'public.enforce_registration_enabled()', 'execute'), 'guard cannot be called directly');

set local role anon;
select ok(public.get_registration_enabled(), 'anonymous clients can read availability before login');
reset role;
select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.admin_set_registration_enabled(false)$$, '42501', null, 'ordinary users cannot close registration');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.admin_set_registration_enabled(false)$$, '42501', null, 'missing session rejected even as owner');
select set_config('request.jwt.claim.sub', '89000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok($$select public.admin_set_registration_enabled(null)$$, '23514', null, 'null setting rejected');
select is(public.admin_set_registration_enabled(false), false, 'admin can close registration');
select is(public.get_registration_enabled(), false, 'closed setting persisted');
reset role;

select throws_ok($$insert into auth.users(id, email, raw_user_meta_data) values
  ('89000000-0000-0000-0000-000000000003', 'blocked@example.invalid', '{"display_name":"Blocked User","name":"Blocked","surname":"User","age":30}')$$,
  '42501', 'Registration is currently disabled.', 'user creation blocked at auth.users even with privileged caller');
select is((select count(*) from auth.users where id = '89000000-0000-0000-0000-000000000003'), 0::bigint, 'blocked signup leaves no account');
select is((select count(*) from public.profiles where user_id = '89000000-0000-0000-0000-000000000003'), 0::bigint, 'blocked signup leaves no profile');
select lives_ok($$update auth.users set raw_user_meta_data = raw_user_meta_data || '{"existing_user_update":true}'::jsonb
  where id = '89000000-0000-0000-0000-000000000002'$$, 'existing auth account updates remain allowed');
select is((select count(*) from auth.users where id in ('89000000-0000-0000-0000-000000000001', '89000000-0000-0000-0000-000000000002')), 2::bigint, 'existing users preserved');

set local role anon;
select is(public.get_registration_enabled(), false, 'closed status visible without login');
reset role;
set local role authenticated;
select is(public.admin_set_registration_enabled(true), true, 'admin can reopen registration');
reset role;
select lives_ok($$insert into auth.users(id, email, raw_user_meta_data) values
  ('89000000-0000-0000-0000-000000000004', 'reopened@example.invalid', '{"display_name":"Reopened User","name":"Reopened","surname":"User","age":30}')$$,
  'signups work again after reopening');
select is((select count(*) from public.profiles where user_id = '89000000-0000-0000-0000-000000000004'), 1::bigint, 'normal profile creation preserved');

delete from public.registration_settings;
select is(public.get_registration_enabled(), false, 'missing setting fails closed');
select throws_ok($$insert into auth.users(id, email) values ('89000000-0000-0000-0000-000000000005', 'missing-setting@example.invalid')$$,
  '42501', null, 'missing setting blocks account creation');
set local role authenticated;
select is(public.admin_set_registration_enabled(true), true, 'admin can restore a missing setting');
reset role;

select * from finish();
rollback;
