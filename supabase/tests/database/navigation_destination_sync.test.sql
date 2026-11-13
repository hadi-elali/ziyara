begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok((select relrowsecurity from pg_class where oid = 'public.trip_navigation_state'::regclass), 'navigation revision has RLS enabled');
select ok(exists (
  select 1 from pg_publication_tables where pubname = 'supabase_realtime'
    and schemaname = 'public' and tablename = 'trip_navigation_state'
), 'navigation revision is published to Realtime');
select ok(not has_table_privilege('anon', 'public.trip_navigation_state', 'select'), 'anonymous clients cannot read the revision');
select ok(not has_table_privilege('authenticated', 'public.trip_navigation_state', 'insert,update,delete,truncate'), 'clients cannot change the revision directly');
select ok(not has_function_privilege('authenticated', 'public.bump_trip_navigation_revision()', 'execute'), 'clients cannot call the trigger function');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns
  where table_schema = 'public' and table_name = 'trip_navigation_state'),
  array['id', 'revision'], 'the signal contains no archived destination content');

insert into auth.users (id, email, raw_user_meta_data) values
  ('71100000-0000-0000-0000-000000000001', 'navigation-sync-admin@example.invalid', '{"display_name":"Navigation Sync Admin"}'),
  ('71100000-0000-0000-0000-000000000002', 'navigation-sync-user@example.invalid', '{"display_name":"Navigation Sync User"}');
update public.profiles set role = 'admin'
where user_id = '71100000-0000-0000-0000-000000000001';
select set_config('test.navigation_revision', (select revision::text from public.trip_navigation_state), true);

select set_config('request.jwt.claim.sub', '71100000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.trip_navigation_state), 1::bigint, 'ordinary unassigned users can read the live signal');
select throws_ok($$update public.trip_navigation_state set revision = revision + 1$$, '42501', null, 'ordinary users cannot forge changes');
select throws_ok($$delete from public.trip_navigation_state$$, '42501', null, 'ordinary users cannot remove the signal');

select set_config('request.jwt.claim.sub', '71100000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.admin_upsert_trip_navigation_destination(null, 'Sync Hotel', 32, 44, 'Tor 3')$$,
  'admin publication also updates the signal'
);
select is((select revision from public.trip_navigation_state), current_setting('test.navigation_revision')::bigint + 1, 'creating a destination advances the revision');
select set_config('test.navigation_destination_id', (select id::text from public.trip_navigation_destinations where name = 'Sync Hotel'), true);
select lives_ok(
  $$select public.admin_upsert_trip_navigation_destination(null, 'Sync Hotel 2', 33, 45, 'Tor 4', current_setting('test.navigation_destination_id')::bigint)$$,
  'admin editing also updates the signal'
);
select is((select revision from public.trip_navigation_state), current_setting('test.navigation_revision')::bigint + 2, 'editing advances the revision');
select throws_ok(
  $$select public.admin_upsert_trip_navigation_destination(null, 'Invalid', 91, 44, '')$$,
  '23514', null, 'invalid writes are rejected'
);
select is((select revision from public.trip_navigation_state), current_setting('test.navigation_revision')::bigint + 2, 'failed writes do not advance the revision');
select throws_ok($$update public.trip_navigation_state set revision = 0$$, '42501', null, 'admins also cannot write the signal directly');
select lives_ok(
  $$select public.admin_archive_trip_navigation_destination(current_setting('test.navigation_destination_id')::bigint)$$,
  'admin removal updates the signal atomically'
);

-- Match Realtime authorization as a different, ordinary signed-in subscriber.
select set_config('request.jwt.claim.sub', '71100000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.trip_navigation_destinations where id = current_setting('test.navigation_destination_id')::bigint), 0::bigint, 'the removed destination is hidden by RLS');
select is((select revision from public.trip_navigation_state), current_setting('test.navigation_revision')::bigint + 3, 'the removal signal remains readable to other subscribers');
select throws_ok(
  $$select public.admin_archive_trip_navigation_destination(current_setting('test.navigation_destination_id')::bigint)$$,
  '42501', null, 'ordinary users cannot archive destinations'
);
select is((select revision from public.trip_navigation_state), current_setting('test.navigation_revision')::bigint + 3, 'unauthorized writes do not advance the revision');

reset role;
delete from public.trip_navigation_destinations where id = current_setting('test.navigation_destination_id')::bigint;
set local role authenticated;
select is((select revision from public.trip_navigation_state), current_setting('test.navigation_revision')::bigint + 4, 'physical deletion also signals subscribers');
reset role;

select * from finish();
rollback;
