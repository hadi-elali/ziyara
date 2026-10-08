begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select ok(
  not has_table_privilege('anon', 'public.trip_navigation_destinations', 'select'),
  'anonymous users cannot read navigation destinations'
);
select ok(
  not has_table_privilege('authenticated', 'public.trip_navigation_destinations', 'insert,update,delete'),
  'authenticated clients cannot write directly'
);
select ok(
  not has_function_privilege('anon', 'public.admin_upsert_trip_navigation_destination(bigint,text,double precision,double precision,text,bigint)', 'execute'),
  'anonymous users cannot publish destinations'
);
select ok(
  not has_function_privilege('anon', 'public.admin_archive_trip_navigation_destination(bigint)', 'execute'),
  'anonymous users cannot archive destinations'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('71000000-0000-0000-0000-000000000001', 'navigation-admin@example.invalid', '{"display_name":"Navigation Admin"}'),
  ('71000000-0000-0000-0000-000000000002', 'navigation-user@example.invalid', '{"display_name":"Navigation User"}');
update public.profiles set role = 'admin'
where user_id = '71000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is((select count(*) from public.trips where archived_at is null), 0::bigint, 'no active trip is needed for this test');
select lives_ok(
  $$ select public.admin_upsert_trip_navigation_destination(null, 'Hotel', 32.616, 44.032, '') $$,
  'an admin creates a map marker without any trip'
);
select is((select trip_id from public.trip_navigation_destinations where name = 'Hotel'), null::bigint, 'new destinations have no trip dependency');
select is((select details from public.trip_navigation_destinations where name = 'Hotel'), null::text, 'blank details are normalized');
select lives_ok(
  $$ select public.admin_upsert_trip_navigation_destination(null, 'Hotel Eingang', 32.617, 44.033, 'Tor 3', (select id from public.trip_navigation_destinations where name = 'Hotel')) $$,
  'an admin edits a marker without a trip'
);
select is((select latitude from public.trip_navigation_destinations where name = 'Hotel Eingang'), 32.617::double precision, 'edited coordinates are saved');
select throws_ok(
  $$ select public.admin_upsert_trip_navigation_destination(null, 'Ungültig', 91, 44, '') $$,
  '23514', null, 'invalid coordinates remain rejected'
);

reset role;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.trip_navigation_destinations), 1::bigint, 'an unassigned signed-in user sees the marker');
select throws_ok(
  $$ select public.admin_upsert_trip_navigation_destination(null, 'Unbefugt', 32, 44, '') $$,
  '42501', 'Admin access required.', 'normal users cannot create destinations'
);
select throws_ok(
  $$ select public.admin_upsert_trip_navigation_destination(null, 'Unbefugt', 32, 44, '', (select id from public.trip_navigation_destinations limit 1)) $$,
  '42501', 'Admin access required.', 'normal users cannot edit destinations'
);
select throws_ok(
  $$ select public.admin_archive_trip_navigation_destination((select id from public.trip_navigation_destinations limit 1)) $$,
  '42501', 'Admin access required.', 'normal users cannot archive destinations'
);

-- Simulate an existing marker that predates this migration.
reset role;
insert into public.trips (name) values ('Historische Zwischenreise');
insert into public.trip_navigation_destinations (trip_id, name, latitude, longitude)
select id, 'Alter Kartenort', 32, 44 from public.trips where name = 'Historische Zwischenreise';
update public.trips set archived_at = now() where name = 'Historische Zwischenreise';
set local role authenticated;
select is((select count(*) from public.trip_navigation_destinations), 2::bigint, 'ending a trip does not hide existing markers from unassigned users');

reset role;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$ select public.admin_upsert_trip_navigation_destination(null, 'Alter Kartenort', 33, 45, 'Aktualisiert', (select id from public.trip_navigation_destinations where name = 'Alter Kartenort')) $$,
  'an admin can edit a marker belonging to an ended trip'
);
select lives_ok(
  $$ select public.admin_upsert_trip_navigation_destination((select id from public.trips where name = 'Historische Zwischenreise'), 'Neuer Kartenort', 32, 44, '') $$,
  'the legacy RPC argument is accepted even for an ended trip'
);
reset role;
delete from public.trips where name = 'Historische Zwischenreise';
set local role authenticated;
select is((select count(*) from public.trip_navigation_destinations), 3::bigint, 'deleting a historical trip preserves all markers');
select lives_ok(
  $$ select public.admin_archive_trip_navigation_destination((select id from public.trip_navigation_destinations where name = 'Alter Kartenort')) $$,
  'an admin can archive a marker without an active trip'
);

reset role;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.trip_navigation_destinations), 2::bigint, 'archived markers disappear for signed-in users');
reset role;
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok(
  $$ select public.admin_upsert_trip_navigation_destination(null, 'Fehlend', 32, 44, '', -1) $$,
  'P0002', 'Active navigation destination not found.', 'missing destinations cannot be edited'
);

select * from finish();
rollback;
