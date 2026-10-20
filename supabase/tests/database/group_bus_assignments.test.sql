begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

-- Keep existing local data intact; all changes below roll back.
update public.bus_boardings set closed_at = now() where closed_at is null;
update public.trips set archived_at = now() where archived_at is null;
insert into auth.users(id, email, raw_user_meta_data)
select ('85000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'group-bus-' || n || '@example.invalid', jsonb_build_object('display_name', 'Group bus ' || n)
from generate_series(1, 9) n;
update public.profiles set role = 'admin' where user_id = '85000000-0000-0000-0000-000000000001';
insert into public.account_families(name) values ('Group bus family');
update public.profiles set family_id = (select id from public.account_families where name = 'Group bus family')
where user_id in ('85000000-0000-0000-0000-000000000004', '85000000-0000-0000-0000-000000000005');
select set_config('test.family', (select id::text from public.account_families where name = 'Group bus family'), true);
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select ok(not has_function_privilege('anon', 'public.admin_assign_trip_group(bigint,bigint,bigint)', 'execute') and not has_function_privilege('anon', 'public.admin_assign_trip_group(bigint,bigint,bigint,uuid)', 'execute'), 'anonymous clients cannot execute group assignment');
select ok(has_function_privilege('authenticated', 'public.admin_assign_trip_group(bigint,bigint,bigint)', 'execute') and has_function_privilege('authenticated', 'public.admin_assign_trip_group(bigint,bigint,bigint,uuid)', 'execute'), 'authenticated clients can reach the guarded RPC');
select set_config('test.group', (public.admin_save_organization_group(
  'Group bus import',
  array['85000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000003']::uuid[],
  '{}'::uuid[], array[current_setting('test.family')::bigint]
)).id::text, true);
select set_config('test.trip', (public.admin_create_trip('Group bus trip')).id::text, true);
select set_config('test.bus1', (public.admin_create_trip_bus_with_leader(current_setting('test.trip')::bigint, 'Group bus 1', '85000000-0000-0000-0000-000000000002')).id::text, true);
select set_config('test.bus2', (public.admin_create_trip_bus_with_leader(current_setting('test.trip')::bigint, 'Group bus 2', '85000000-0000-0000-0000-000000000006')).id::text, true);
select public.admin_assign_trip_family(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.family')::bigint);

select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.group')::bigint)$$, '22023', 'Select a group leader to lead the bus.', 'multiple leaders require an explicit choice before any assignment');
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.group')::bigint, '85000000-0000-0000-0000-000000000004')$$, '22023', 'Selected group leader not found.', 'a regular member cannot become bus leader through group import');
select is((select count(*) from public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.group')::bigint, '85000000-0000-0000-0000-000000000003'::uuid)), 4::bigint, 'imports the entire group, including both leaders');
select is((select p.user_id from public.trip_buses b join public.trip_participants tp on tp.id = b.leader_participant_id join public.profiles p on p.id = tp.profile_id where b.id = current_setting('test.bus1')::bigint), '85000000-0000-0000-0000-000000000003'::uuid, 'the selected group leader replaces the former bus leader atomically');
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint and bus_id = current_setting('test.bus1')::bigint), 4::bigint, 'existing family and leader assignments are reused');
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint and assignment_family_id = current_setting('test.family')::bigint), 2::bigint, 'preserves the existing family assignment marker');
select is((select count(*) from public.organization_group_members where group_id = current_setting('test.group')::bigint and is_leader), 2::bigint, 'group leadership is unchanged');
select set_config('test.ids', (select string_agg(id::text, ',' order by id) from public.trip_participants where trip_id = current_setting('test.trip')::bigint), true);
select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.group')::bigint, '85000000-0000-0000-0000-000000000003'::uuid);
select is((select string_agg(id::text, ',' order by id) from public.trip_participants where trip_id = current_setting('test.trip')::bigint), current_setting('test.ids'), 'repeating assignment preserves participant IDs without duplicates');

select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, current_setting('test.group')::bigint, '85000000-0000-0000-0000-000000000003'::uuid)$$, '55000', 'A group member leads another bus.', 'does not move a leader away from their bus');
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint and bus_id = current_setting('test.bus1')::bigint), 4::bigint, 'a leader conflict leaves every member unchanged');
select public.admin_set_trip_bus_leader(current_setting('test.bus1')::bigint, '85000000-0000-0000-0000-000000000008');
select is((select count(*) from public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, current_setting('test.group')::bigint, '85000000-0000-0000-0000-000000000003'::uuid)), 4::bigint, 'a complete group can move together after changing the bus leader');
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint and bus_id = current_setting('test.bus2')::bigint), 5::bigint, 'keeps the target bus leader alongside imported members');

select public.admin_save_organization_group('Group bus import', array['85000000-0000-0000-0000-000000000002', '85000000-0000-0000-0000-000000000003']::uuid[], array['85000000-0000-0000-0000-000000000004', '85000000-0000-0000-0000-000000000005', '85000000-0000-0000-0000-000000000009']::uuid[], '{}', current_setting('test.group')::bigint);
select is((select count(*) from public.trip_participants tp join public.profiles p on p.id = tp.profile_id where tp.trip_id = current_setting('test.trip')::bigint and p.user_id = '85000000-0000-0000-0000-000000000009'), 0::bigint, 'later group edits do not silently change bus assignments');
select is((select count(*) from public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, current_setting('test.group')::bigint, '85000000-0000-0000-0000-000000000003'::uuid)), 5::bigint, 'reimport resolves current group membership on the server');

select public.admin_save_organization_group('Group bus import', array['85000000-0000-0000-0000-000000000002']::uuid[], array['85000000-0000-0000-0000-000000000004']::uuid[], '{}', current_setting('test.group')::bigint);
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.group')::bigint)$$, '55000', 'The group would split an existing family bus assignment.', 'cannot split a previously assigned family');
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint and bus_id = current_setting('test.bus2')::bigint), 6::bigint, 'family conflicts cannot partially move the group');
select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, current_setting('test.group')::bigint);
select is((select p.user_id from public.trip_buses b join public.trip_participants tp on tp.id = b.leader_participant_id join public.profiles p on p.id = tp.profile_id where b.id = current_setting('test.bus2')::bigint), '85000000-0000-0000-0000-000000000002'::uuid, 'a sole group leader automatically leads the bus for older clients too');

select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000002', true);
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.group')::bigint)$$, '42501', 'Admin access required.', 'group leaders do not gain bus administration rights');
select set_config('request.jwt.claim.sub', '85000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, -1, current_setting('test.group')::bigint)$$, '23503', 'Bus does not belong to the active trip.', 'rejects a bus outside the active trip');
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, -1)$$, 'P0002', 'Group not found.', 'rejects a deleted or unknown group');
reset role;
insert into public.organization_groups(name) values ('Empty group bus test');
select set_config('test.empty_group', (select id::text from public.organization_groups where name = 'Empty group bus test'), true);
set local role authenticated;
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.empty_group')::bigint)$$, '22023', 'The selected group has no accounts.', 'rejects an empty group');

-- A database-owner fixture exercises the defensive guard for historical clients.
reset role;
select set_config('test.boarding', (public.admin_start_bus_boarding(current_setting('test.trip')::bigint, 'Group bus boarding', now() + interval '1 hour')).id::text, true);
set local role authenticated;
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, current_setting('test.group')::bigint)$$, '55000', 'Close the active boarding before changing bus assignments.', 'open boarding blocks group assignments');
select public.admin_close_bus_boarding(current_setting('test.boarding')::bigint);
select public.admin_archive_trip(current_setting('test.trip')::bigint);
select throws_ok($$select public.admin_assign_trip_group(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, current_setting('test.group')::bigint)$$, 'P0002', 'Active trip not found.', 'ended trips cannot be changed');
select set_config('test.copy', (public.admin_copy_trip_bus_setup(current_setting('test.trip')::bigint, 'Group bus next trip')).id::text, true);
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.copy')::bigint), 7::bigint, 'next-trip copy preserves all imported assignments');
select is((select p.user_id from public.trip_buses b join public.trip_participants tp on tp.id = b.leader_participant_id join public.profiles p on p.id = tp.profile_id where b.trip_id = current_setting('test.copy')::bigint and b.name = 'Group bus 2'), '85000000-0000-0000-0000-000000000002'::uuid, 'next-trip copy preserves the imported group leader as bus leader');
select is((select count(*) from public.bus_boardings where trip_id = current_setting('test.copy')::bigint), 0::bigint, 'next-trip copy never copies boarding state');
select ok(not has_table_privilege('authenticated', 'public.trip_participants', 'insert') and not has_function_privilege('authenticated', 'public.admin_start_bus_boarding(bigint,text,timestamptz)', 'execute'), 'direct assignment writes and retired boarding creation remain unavailable');

select * from finish();
rollback;
