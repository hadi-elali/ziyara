begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

update public.bus_boardings set closed_at = now() where closed_at is null;
update public.trips set archived_at = now() where archived_at is null;
insert into auth.users(id, email, raw_user_meta_data)
select ('86000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'bus-self-' || n || '@example.invalid', jsonb_build_object('display_name', 'Bus self ' || n)
from generate_series(1, 4) n;
update public.profiles set role = 'admin' where user_id = '86000000-0000-0000-0000-000000000001';
insert into public.account_families(name) values ('Bus self family');
select set_config('test.family', (select id::text from public.account_families where name = 'Bus self family'), true);
update public.profiles set family_id = current_setting('test.family')::bigint
where user_id in ('86000000-0000-0000-0000-000000000002', '86000000-0000-0000-0000-000000000003');

select ok(not has_function_privilege('anon', 'public.select_trip_bus(bigint,bigint)', 'execute'), 'guests cannot choose a bus');
select ok(not has_function_privilege('authenticated', 'public.move_trip_profile_to_bus(bigint,bigint,bigint)', 'execute'), 'clients cannot choose another profile through the helper');
select ok(not has_table_privilege('authenticated', 'public.trip_participants', 'insert') and not has_table_privilege('authenticated', 'public.trip_participants', 'update'), 'direct participant writes remain unavailable');
select ok(not has_function_privilege('anon', 'public.admin_trip_bus_roster(bigint)', 'execute'), 'guests cannot read the roster');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select set_config('test.trip', (public.admin_create_trip('Bus self trip')).id::text, true);
select set_config('test.bus1', (public.admin_create_trip_bus(current_setting('test.trip')::bigint, 'Self bus 1')).id::text, true);
select set_config('test.bus2', (public.admin_create_trip_bus(current_setting('test.trip')::bigint, 'Self bus 2')).id::text, true);
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint), 0::bigint, 'creating buses needs no assigned leader or participant');
select is((select count(*) from public.admin_trip_bus_roster(current_setting('test.trip')::bigint) where user_id::text like '86000000-%' and bus_id is null), 4::bigint, 'admin roster includes accounts that have not chosen a bus');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.trips where id = current_setting('test.trip')::bigint), 1::bigint, 'an unassigned account can see the active trip');
select is((select count(*) from public.trip_buses where trip_id = current_setting('test.trip')::bigint), 2::bigint, 'an unassigned account can see every available bus');
select throws_ok($$select public.admin_trip_bus_roster(current_setting('test.trip')::bigint)$$, '42501', 'Admin access required.', 'ordinary accounts cannot read other names or assignments');
select throws_ok($$select public.admin_move_trip_person(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, '86000000-0000-0000-0000-000000000003')$$, '42501', 'Admin access required.', 'ordinary accounts cannot move someone else');
select throws_ok($$select public.admin_create_trip_bus(current_setting('test.trip')::bigint, 'Unauthorized bus')$$, '42501', 'Admin access required.', 'ordinary accounts cannot create buses');
select set_config('test.participant', (public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint)).id::text, true);
select is((select bus_id from public.trip_participants where id = current_setting('test.participant')::bigint), current_setting('test.bus1')::bigint, 'an unassigned account can select a bus');
select is((public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint)).id, current_setting('test.participant')::bigint, 'repeated selection reuses the participant ID');
select is((public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint)).bus_id, current_setting('test.bus2')::bigint, 'users can move themselves to another bus');
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint), 1::bigint, 'switching never duplicates the account assignment');
select throws_ok($$select public.select_trip_bus(current_setting('test.trip')::bigint, -1)$$, '23503', 'Bus does not belong to the active trip.', 'unknown buses are rejected');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select public.admin_assign_trip_family(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, current_setting('test.family')::bigint);
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
select is((public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint)).assignment_family_id, null::bigint, 'a personal selection detaches only its old family snapshot marker');
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint), 1::bigint, 'RLS reveals only the current account participant');
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select is((select bus_id from public.trip_participants where trip_id = current_setting('test.trip')::bigint and profile_id = (select id from public.profiles where user_id = '86000000-0000-0000-0000-000000000003')), current_setting('test.bus1')::bigint, 'other family members stay on their bus');
select is((public.admin_move_trip_person(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, '86000000-0000-0000-0000-000000000003')).bus_id, current_setting('test.bus2')::bigint, 'admins can move a single account from a family');
select is((select bus_id from public.admin_trip_bus_roster(current_setting('test.trip')::bigint) where user_id = '86000000-0000-0000-0000-000000000002'), current_setting('test.bus2')::bigint, 'roster reflects the users own bus change');
select is((select bus_id from public.admin_trip_bus_roster(current_setting('test.trip')::bigint) where user_id = '86000000-0000-0000-0000-000000000003'), current_setting('test.bus2')::bigint, 'roster reflects the admin move');

select public.admin_set_trip_bus_leader(current_setting('test.bus2')::bigint, '86000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
select is((public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint)).id, current_setting('test.participant')::bigint, 'reselecting the same bus preserves the participant');
select is((select leader_participant_id from public.trip_buses where id = current_setting('test.bus2')::bigint), current_setting('test.participant')::bigint, 'reselecting the same bus preserves leadership');
select public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint);
select is((select leader_participant_id from public.trip_buses where id = current_setting('test.bus2')::bigint), null::bigint, 'a bus leader can switch and vacates the previous leadership');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select public.admin_archive_trip(current_setting('test.trip')::bigint);
select set_config('test.next_trip', (public.admin_create_trip('Next bus self trip')).id::text, true);
select set_config('test.next_bus', (public.admin_create_trip_bus(current_setting('test.next_trip')::bigint, 'Next self bus')).id::text, true);
select throws_ok($$select public.admin_move_trip_person(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, '86000000-0000-0000-0000-000000000002')$$, 'P0002', 'Active trip not found.', 'admin moves cannot change ended trips');
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.trips where id = current_setting('test.trip')::bigint), 0::bigint, 'unrelated accounts cannot read historical trips');
select is((select count(*) from public.trip_buses where trip_id = current_setting('test.trip')::bigint), 0::bigint, 'unrelated accounts cannot read historical buses');
select throws_ok($$select public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint)$$, 'P0002', 'Active trip not found.', 'users cannot select a bus in an ended trip');
select throws_ok($$select public.select_trip_bus(current_setting('test.next_trip')::bigint, current_setting('test.bus1')::bigint)$$, '23503', 'Bus does not belong to the active trip.', 'users cannot select a bus from another trip');
select is((select count(*) from public.trip_participants), 0::bigint, 'a failed selection creates no participant');
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000099', true);
select throws_ok($$select public.select_trip_bus(current_setting('test.next_trip')::bigint, current_setting('test.next_bus')::bigint)$$, '42501', 'User profile is required.', 'an identity without a profile cannot choose a bus');
select set_config('request.jwt.claim.sub', '', true);
select throws_ok($$select public.select_trip_bus(current_setting('test.next_trip')::bigint, current_setting('test.next_bus')::bigint)$$, '42501', 'Authentication required.', 'missing identity cannot mutate even with an authenticated role');

select * from finish();
rollback;
