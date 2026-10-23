begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'lock_app', 'the home switch exists');
select col_type_is('public', 'lock_app', 'lock', 'boolean', 'lock remains boolean');
select col_default_is('public', 'lock_app', 'lock', 'false', 'the database default is false');

-- Keep any existing local switch value intact after the test rollback.
update public.lock_app set lock = false where id = 1;

set local role anon;
select is((select lock from public.lock_app where id = 1), false, 'guests can read the false switch');
select throws_ok($$update public.lock_app set lock = true where id = 1$$,
  '42501', null, 'guests cannot toggle the switch');
select throws_ok($$insert into public.lock_app(id, lock) overriding system value values (2, true)$$,
  '42501', null, 'guests cannot insert switches');
select throws_ok($$delete from public.lock_app where id = 1$$,
  '42501', null, 'guests cannot delete the switch');

reset role;
update public.lock_app set lock = true where id = 1;

set local role anon;
select is((select lock from public.lock_app where id = 1), true, 'guests can read an enabled switch');
reset role;
set local role authenticated;
select is((select lock from public.lock_app where id = 1), true, 'signed-in accounts can read the switch');
select throws_ok($$update public.lock_app set lock = false where id = 1$$,
  '42501', null, 'signed-in accounts cannot toggle the switch');
select throws_ok($$insert into public.lock_app(id, lock) overriding system value values (2, true)$$,
  '42501', null, 'signed-in accounts cannot insert switches');
select throws_ok($$delete from public.lock_app where id = 1$$,
  '42501', null, 'signed-in accounts cannot delete the switch');

reset role;
update public.lock_app set lock = false where id = 1;
set local role authenticated;
select is((select lock from public.lock_app where id = 1), false, 'unlocking is visible to signed-in accounts');
select ok(not has_table_privilege('authenticated', 'public.lock_app', 'TRUNCATE'),
  'signed-in accounts cannot truncate the switch table');

reset role;
select * from finish();
rollback;
