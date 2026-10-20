begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Isolate historical fixtures without changing existing local travel data.
update public.bus_boardings set closed_at = now() where closed_at is null;
update public.trips set archived_at = now() where archived_at is null;

select ok(
  (
    select count(*) = 5
    from information_schema.tables as tables
    where tables.table_schema = 'public'
      and tables.table_name in (
        'trips',
        'trip_buses',
        'trip_participants',
        'bus_boardings',
        'bus_boarding_responses'
      )
  ),
  'all five bus-management tables exist'
);
select enum_has_labels(
  'public',
  'bus_boarding_status',
  array['read', 'on_way', 'boarded', 'problem'],
  'boarding status includes the general-alarm acknowledgement state'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '40000000-0000-0000-0000-000000000001',
    'phase8-bus-admin@example.invalid',
    '{"display_name":"Phase 8 Bus Admin"}'::jsonb
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    'phase8-bus-user@example.invalid',
    '{"display_name":"Phase 8 Bus User"}'::jsonb
  ),
  (
    '40000000-0000-0000-0000-000000000003',
    'phase8-bus-other@example.invalid',
    '{"display_name":"Phase 8 Other User"}'::jsonb
  );

update public.profiles
set role = 'admin'
where user_id = '40000000-0000-0000-0000-000000000001';

select results_eq(
  $$
    select tables.table_name::text
    from information_schema.tables as tables
    where tables.table_schema = 'public'
      and tables.table_name in (
        'trips',
        'trip_buses',
        'trip_participants',
        'bus_boardings',
        'bus_boarding_responses'
      )
      and has_table_privilege(
        'anon',
        format('%I.%I', tables.table_schema, tables.table_name),
        'select'
      )
  $$,
  $$ select null::text where false $$,
  'anonymous users have no read grant on bus-management tables'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.respond_to_bus_boarding(bigint,bigint,public.bus_boarding_status)',
    'execute'
  ),
  'anonymous users cannot submit a boarding status'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select throws_ok(
  $$ select public.admin_create_trip('Unzulässige Fahrt') $$,
  '42501',
  'Admin access required.',
  'a normal user cannot create a trip'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.admin_create_trip('Phase 8 Ziyara') $$,
  'an admin creates the active trip'
);
select lives_ok(
  $$
    select public.admin_create_trip_bus(
      (select id from public.trips where name = 'Phase 8 Ziyara'),
      'Bus 1'
    )
  $$,
  'an admin creates a named bus'
);
select lives_ok(
  $$
    select public.admin_upsert_trip_participant(
      (select id from public.trips where name = 'Phase 8 Ziyara'),
      'ber 01',
      'Verknüpfter Teilnehmer',
      '40000000-0000-0000-0000-000000000002',
      (select id from public.trip_buses where name = 'Bus 1')
    )
  $$,
  'an admin links a physical participant ID to an account'
);
select lives_ok(
  $$
    select public.admin_upsert_trip_participant(
      (select id from public.trips where name = 'Phase 8 Ziyara'),
      'DUS02',
      'Teilnehmer ohne App-Konto',
      null,
      (select id from public.trip_buses where name = 'Bus 1')
    )
  $$,
  'an admin can retain a participant without an app account'
);
select is(
  (
    select participant_code
    from public.trip_participants
    where display_name = 'Verknüpfter Teilnehmer'
  ),
  'BER01',
  'participant IDs are normalized before storage'
);
select throws_ok(
  $$
    select public.admin_start_bus_boarding(
      (select id from public.trips where name = 'Phase 8 Ziyara'),
      'Abfahrt nach Karbala',
      now() + interval '15 minutes'
    )
  $$,
  '42501',
  'permission denied for function admin_start_bus_boarding',
  'retired boarding cannot be started by clients'
);

-- Historical fixtures retain coverage of the legacy response/RLS APIs.
reset role;
select public.admin_start_bus_boarding(
  (select id from public.trips where name = 'Phase 8 Ziyara'),
  'Historisches Boarding', now() + interval '15 minutes'
);
set local role authenticated;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  (select count(*) from public.trips where archived_at is null),
  1::bigint,
  'a linked participant can read the active trip'
);
select is(
  (select count(*) from public.trip_participants),
  1::bigint,
  'a participant reads only physical IDs linked to their account'
);
select throws_ok(
  $$
    select public.respond_to_bus_boarding(
      (select id from public.bus_boardings where closed_at is null),
      (select id from public.trip_participants where participant_code = 'BER01'),
      'boarded'::public.bus_boarding_status
    )
  $$,
  '22023',
  'Invalid participant boarding status transition.',
  'a participant cannot skip the required acknowledgement stages'
);
select lives_ok(
  $$
    do $status_flow$
    declare
      active_boarding_id int8 := (
        select id from public.bus_boardings where closed_at is null
      );
      linked_participant_id int8 := (
        select id from public.trip_participants where participant_code = 'BER01'
      );
    begin
      perform public.respond_to_bus_boarding(
        active_boarding_id,
        linked_participant_id,
        'read'::public.bus_boarding_status
      );
      perform public.respond_to_bus_boarding(
        active_boarding_id,
        linked_participant_id,
        'on_way'::public.bus_boarding_status
      );
      perform public.respond_to_bus_boarding(
        active_boarding_id,
        linked_participant_id,
        'boarded'::public.bus_boarding_status
      );
    end;
    $status_flow$
  $$,
  'a participant confirms their linked physical ID in the required order'
);
select throws_ok(
  $$
    select public.respond_to_bus_boarding(
      (select id from public.bus_boardings where closed_at is null),
      (
        select id
        from public.trip_participants
        where participant_code = 'DUS02'
      ),
      'boarded'::public.bus_boarding_status
    )
  $$,
  '42501',
  'Participant is not linked to the current user.',
  'a participant cannot confirm another physical ID'
);
select is(
  (select count(*) from public.bus_boarding_responses),
  1::bigint,
  'a participant reads only their own response'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.admin_set_bus_boarding_status(
      (select id from public.bus_boardings where closed_at is null),
      (select id from public.trip_participants where participant_code = 'DUS02'),
      'problem'::public.bus_boarding_status
    )
  $$,
  'the trip admin records a status for a participant without an account'
);
select is(
  (select count(*) from public.bus_boarding_responses),
  2::bigint,
  'the admin overview contains account and physical-participant confirmations'
);
select lives_ok(
  $$
    select public.admin_close_bus_boarding(
      (select id from public.bus_boardings where closed_at is null)
    )
  $$,
  'the admin closes the boarding round'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select public.respond_to_bus_boarding(
      (select id from public.bus_boardings order by id desc limit 1),
      (select id from public.trip_participants where participant_code = 'BER01'),
      'on_way'::public.bus_boarding_status
    )
  $$,
  'P0002',
  'Active boarding not found.',
  'closed boarding rounds reject later status changes'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.admin_archive_trip(
      (select id from public.trips where archived_at is null)
    )
  $$,
  'the admin archives a trip after its boarding is closed'
);
select lives_ok(
  $$ select public.admin_create_trip('Phase 8 Folgereise') $$,
  'a new active trip can be created after archiving'
);
select is(
  (select count(*) from public.trips where archived_at is null),
  1::bigint,
  'only one trip remains active'
);

select * from finish();

rollback;
