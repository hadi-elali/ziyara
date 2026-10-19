begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users(id, email, raw_user_meta_data)
select ('82000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
       'group-name-check-' || n || '@example.invalid',
       jsonb_build_object('display_name', 'Group name check ' || n)
from generate_series(1, 3) n;
update public.profiles set role = 'admin'
where user_id = '82000000-0000-0000-0000-000000000001';

-- Isolate short test names from local data; all changes are rolled back below.
delete from public.organization_groups where name in ('A', '1', 'ع', 'Q', repeat('n', 80));
select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select lives_ok($$select set_config('test.group', (public.admin_save_organization_group(
  ' A ', array['82000000-0000-0000-0000-000000000002']::uuid[], '{}'::uuid[]
)).id::text, true)$$, 'admins can create a group with a single-character name');
select is((select name from public.organization_groups where id = current_setting('test.group')::bigint),
  'A', 'surrounding spaces are trimmed');
select lives_ok($$select public.admin_save_organization_group(
  '1', array['82000000-0000-0000-0000-000000000002']::uuid[], '{}'::uuid[],
  p_group_id => current_setting('test.group')::bigint
)$$, 'an existing group can be renamed to a single digit');
select is((select name from public.organization_groups where id = current_setting('test.group')::bigint),
  '1', 'the short name is persisted');
select lives_ok($$select public.admin_save_organization_group(
  'ع', array['82000000-0000-0000-0000-000000000002']::uuid[], '{}'::uuid[],
  p_group_id => current_setting('test.group')::bigint
)$$, 'single-character Arabic names are accepted');
select lives_ok($$select public.admin_save_organization_group(
  repeat('n', 80), array['82000000-0000-0000-0000-000000000002']::uuid[], '{}'::uuid[],
  p_group_id => current_setting('test.group')::bigint
)$$, 'the existing 80-character upper bound remains inclusive');

select throws_ok($$select public.admin_save_organization_group(null, '{}'::uuid[], '{}'::uuid[])$$,
  '22023', 'Group name is required and must not exceed 80 characters.', 'null names are rejected');
select throws_ok($$select public.admin_save_organization_group('', '{}'::uuid[], '{}'::uuid[])$$,
  '22023', 'Group name is required and must not exceed 80 characters.', 'the name remains required');
select throws_ok($$select public.admin_save_organization_group('   ', '{}'::uuid[], '{}'::uuid[])$$,
  '22023', 'Group name is required and must not exceed 80 characters.', 'spaces alone are rejected');
select throws_ok($$select public.admin_save_organization_group(repeat('n', 81), '{}'::uuid[], '{}'::uuid[])$$,
  '22023', 'Group name is required and must not exceed 80 characters.', 'overlong names are rejected');

select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.admin_save_organization_group('A', '{}'::uuid[], '{}'::uuid[])$$,
  '42501', 'Admin access required.', 'short names do not bypass admin authorization');

reset role;
select lives_ok($$insert into public.organization_groups(name) values ('Q')$$,
  'the table constraint accepts a single character');
select throws_ok($$insert into public.organization_groups(name) values ('   ')$$,
  '23514', null, 'the table constraint still rejects blank names');
select throws_ok($$insert into public.organization_groups(name) values (repeat('n', 81))$$,
  '23514', null, 'the table constraint preserves the maximum length');

select set_config('request.jwt.claim.sub', '82000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok($$select public.admin_save_organization_group(
  'Q', array['82000000-0000-0000-0000-000000000003']::uuid[], '{}'::uuid[]
)$$, '23505', null, 'single-character names must still be unique');

select * from finish();
rollback;
