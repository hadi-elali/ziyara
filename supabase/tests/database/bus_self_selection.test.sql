begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

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
select ok(not has_function_privilege('anon', 'public.admin_start_trip_bus_selection(bigint)', 'execute'), 'guests cannot release bus selection');
select ok(not has_table_privilege('authenticated', 'public.trips', 'update'), 'clients cannot release selection through direct trip updates');
select ok(not has_function_privilege('authenticated', 'public.move_trip_profile_to_bus(bigint,bigint,bigint)', 'execute'), 'clients cannot choose another profile through the helper');
select ok(not has_table_privilege('authenticated', 'public.trip_participants', 'insert') and not has_table_privilege('authenticated', 'public.trip_participants', 'update'), 'direct participant writes remain unavailable');
select ok(not has_function_privilege('anon', 'public.admin_trip_bus_roster(bigint)', 'execute'), 'guests cannot read the roster');
select ok(not has_function_privilege('anon', 'public.admin_remove_trip_bus_leader(bigint)', 'execute'), 'guests cannot remove bus leaders');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select set_config('test.trip', (public.admin_create_trip('Bus self trip')).id::text, true);
select is((select bus_selection_started_at from public.trips where id = current_setting('test.trip')::bigint), null::timestamptz, 'new trips begin in preparation');
select throws_ok($$select public.admin_start_trip_bus_selection(current_setting('test.trip')::bigint)$$, '55000', 'Create at least one bus before starting selection.', 'empty trips cannot start selection');
select throws_ok($$select public.admin_start_trip_bus_selection(-1)$$, 'P0002', 'Active trip not found.', 'unknown trips cannot start selection');
select set_config('test.bus1', (public.admin_create_trip_bus(current_setting('test.trip')::bigint, 'Self bus 1')).id::text, true);
reset role;
select is((select count(*) from public.bus_selection_notifications where trip_id = current_setting('test.trip')::bigint), 0::bigint, 'the first bus does not create a notification');
set local role authenticated;
select set_config('test.bus2', (public.admin_create_trip_bus(current_setting('test.trip')::bigint, 'Self bus 2')).id::text, true);
select is((select count(*) from public.trip_participants where trip_id = current_setting('test.trip')::bigint), 0::bigint, 'creating buses needs no assigned leader or participant');
select is((select count(*) from public.admin_trip_bus_roster(current_setting('test.trip')::bigint) where user_id::text like '86000000-%' and bus_id is null), 4::bigint, 'admin roster includes accounts that have not chosen a bus');
select is((public.admin_remove_trip_bus_leader(current_setting('test.bus1')::bigint)).leader_participant_id, null::bigint, 'removing an unset leader is harmless');
select throws_ok($$select public.admin_remove_trip_bus_leader(-1)$$, 'P0002', 'Bus in active trip not found.', 'unknown buses cannot have their leadership changed');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
select is((select count(*) from public.trips where id = current_setting('test.trip')::bigint), 1::bigint, 'an unassigned account can see the active trip');
select is((select count(*) from public.trip_buses where trip_id = current_setting('test.trip')::bigint), 2::bigint, 'an unassigned account can see every available bus');
select throws_ok($$select public.admin_trip_bus_roster(current_setting('test.trip')::bigint)$$, '42501', 'Admin access required.', 'ordinary accounts cannot read other names or assignments');
select throws_ok($$select public.admin_move_trip_person(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, '86000000-0000-0000-0000-000000000003')$$, '42501', 'Admin access required.', 'ordinary accounts cannot move someone else');
select throws_ok($$select public.admin_create_trip_bus(current_setting('test.trip')::bigint, 'Unauthorized bus')$$, '42501', 'Admin access required.', 'ordinary accounts cannot create buses');
select throws_ok($$select public.admin_remove_trip_bus_leader(current_setting('test.bus1')::bigint)$$, '42501', 'Admin access required.', 'ordinary accounts cannot remove bus leaders');
select throws_ok($$select public.admin_start_trip_bus_selection(current_setting('test.trip')::bigint)$$, '42501', 'Admin access required.', 'ordinary accounts cannot release selection');
select throws_ok($$select public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint)$$, '55000', 'Bus selection has not started.', 'buses cannot be selected during preparation');
select throws_ok($$select public.set_trip_bus_presence(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint, true)$$, '55000', 'Bus selection has not started.', 'presence cannot be confirmed during preparation');
reset role;
select is((select count(*) from public.bus_selection_notifications where trip_id = current_setting('test.trip')::bigint), 0::bigint, 'adding more buses still does not notify');
select is((select count(*) from public.claim_bus_selection_notifications(current_setting('test.trip')::bigint, '86000000-0000-0000-0000-000000000001')), 0::bigint, 'early dispatcher calls cannot claim devices');
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
select id, 'ExpoPushToken[busreleasefixture0001]', 'ios' from public.profiles
where user_id = '86000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select ok((public.admin_start_trip_bus_selection(current_setting('test.trip')::bigint)).bus_selection_started_at is not null, 'admin explicitly releases all buses');
select set_config('test.started_at', (select bus_selection_started_at::text from public.trips where id = current_setting('test.trip')::bigint), true);
select is((public.admin_start_trip_bus_selection(current_setting('test.trip')::bigint)).bus_selection_started_at, current_setting('test.started_at')::timestamptz, 'repeated release preserves the original timestamp');
reset role;
select is((select count(*) from public.bus_selection_notifications where trip_id = current_setting('test.trip')::bigint), 1::bigint, 'release creates exactly one notification');
select is((select count(*) from public.bus_selection_push_attempts where trip_id = current_setting('test.trip')::bigint), (select count(*) from public.push_notification_devices), 'release snapshots devices registered after bus creation too');
select is((select count(*) from public.bus_selection_push_attempts where trip_id = current_setting('test.trip')::bigint and device_id = (select id from public.push_notification_devices where expo_push_token = 'ExpoPushToken[busreleasefixture0001]')), 1::bigint, 'the late device is captured once');
set local role authenticated;
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
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
select public.admin_assign_trip_family(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, current_setting('test.family')::bigint);
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
select public.set_trip_bus_presence(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint, true);
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select set_config('test.participants_before_removal', (
  select jsonb_agg(to_jsonb(participants) order by id)::text
  from public.trip_participants as participants where trip_id = current_setting('test.trip')::bigint
), true);
select is((public.admin_remove_trip_bus_leader(current_setting('test.bus2')::bigint)).leader_participant_id, null::bigint, 'the removal RPC returns a bus without a leader');
select is((select leader_participant_id from public.trip_buses where id = current_setting('test.bus2')::bigint), null::bigint, 'removing a leader is persisted');
select is((
  select jsonb_agg(to_jsonb(participants) order by id)
  from public.trip_participants as participants where trip_id = current_setting('test.trip')::bigint
), current_setting('test.participants_before_removal')::jsonb, 'removal preserves every participant, bus, family marker and presence response');
select is((public.admin_remove_trip_bus_leader(current_setting('test.bus2')::bigint)).leader_participant_id, null::bigint, 'repeated removal remains harmless');
select public.admin_set_trip_bus_leader(current_setting('test.bus2')::bigint, '86000000-0000-0000-0000-000000000002');
select is((select leader_participant_id from public.trip_buses where id = current_setting('test.bus2')::bigint), current_setting('test.participant')::bigint, 'a removed leader can be assigned again');
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000002', true);
select is((public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus2')::bigint)).id, current_setting('test.participant')::bigint, 'reselecting the same bus preserves the participant');
select is((select leader_participant_id from public.trip_buses where id = current_setting('test.bus2')::bigint), current_setting('test.participant')::bigint, 'reselecting the same bus preserves leadership');
select public.select_trip_bus(current_setting('test.trip')::bigint, current_setting('test.bus1')::bigint);
select is((select leader_participant_id from public.trip_buses where id = current_setting('test.bus2')::bigint), null::bigint, 'a bus leader can switch and vacates the previous leadership');

select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select public.admin_archive_trip(current_setting('test.trip')::bigint);
select throws_ok($$select public.admin_remove_trip_bus_leader(current_setting('test.bus2')::bigint)$$, 'P0002', 'Bus in active trip not found.', 'leaders of ended trips cannot be removed');
select set_config('test.next_trip', (public.admin_create_trip('Next bus self trip')).id::text, true);
select set_config('test.next_bus', (public.admin_create_trip_bus(current_setting('test.next_trip')::bigint, 'Next self bus')).id::text, true);
select public.admin_start_trip_bus_selection(current_setting('test.next_trip')::bigint);
select throws_ok($$select public.admin_start_trip_bus_selection(current_setting('test.trip')::bigint)$$, 'P0002', 'Active trip not found.', 'archived trips cannot restart selection');
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
select throws_ok($$select public.admin_remove_trip_bus_leader(current_setting('test.next_bus')::bigint)$$, '42501', 'Admin access required.', 'missing identity cannot remove a bus leader');
select throws_ok($$select public.select_trip_bus(current_setting('test.next_trip')::bigint, current_setting('test.next_bus')::bigint)$$, '42501', 'Authentication required.', 'missing identity cannot mutate even with an authenticated role');

select throws_ok($$select public.admin_start_trip_bus_selection(current_setting('test.next_trip')::bigint)$$, '42501', 'Admin access required.', 'missing identity cannot release selection');
select set_config('request.jwt.claim.sub', '86000000-0000-0000-0000-000000000001', true);
select public.admin_archive_trip(current_setting('test.next_trip')::bigint);
select set_config('test.copy', (public.admin_copy_trip_bus_setup(current_setting('test.trip')::bigint, 'Copied selection draft')).id::text, true);
select is((select bus_selection_started_at from public.trips where id = current_setting('test.copy')::bigint), null::timestamptz, 'copied trips wait for a fresh explicit release');
reset role;
select is((select count(*) from public.trip_buses where trip_id = current_setting('test.copy')::bigint), 2::bigint, 'the copied draft contains all source buses');
select is((select count(*) from public.bus_selection_notifications where trip_id = current_setting('test.copy')::bigint), 0::bigint, 'copying buses does not notify');
set local role authenticated;
select public.admin_start_trip_bus_selection(current_setting('test.copy')::bigint);
reset role;
select is((select count(*) from public.bus_selection_notifications where trip_id = current_setting('test.copy')::bigint), 1::bigint, 'a copied trip notifies only after release');

select * from finish();
rollback;
