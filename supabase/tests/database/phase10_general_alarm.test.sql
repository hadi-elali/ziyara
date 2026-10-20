begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- Retain historical dispatcher coverage without changing local travel data.
update public.bus_boardings set closed_at = now() where closed_at is null;
update public.trips set archived_at = now() where archived_at is null;

select ok(
  (
    select count(*) = 3
    from information_schema.tables as tables
    where tables.table_schema = 'public'
      and tables.table_name in (
        'bus_boarding_escalations',
        'general_alarm_notification_attempts',
        'push_notification_devices'
      )
  ),
  'the three general-alarm tables exist'
);
select col_default_is(
  'public',
  'bus_boardings',
  'reminder_interval_minutes',
  '5',
  'boarding reminders default to five minutes'
);
select col_default_is(
  'public',
  'bus_boardings',
  'urgent_before_minutes',
  '5',
  'boarding alarms become urgent five minutes before departure'
);

select ok(
  not has_table_privilege('anon', 'public.push_notification_devices', 'select'),
  'anonymous users cannot read push tokens'
);
select ok(
  not has_table_privilege('authenticated', 'public.push_notification_devices', 'select'),
  'authenticated users cannot list push tokens'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.general_alarm_notification_attempts',
    'select'
  ),
  'authenticated users cannot read notification attempts'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_due_general_alarm_notifications()',
    'execute'
  ),
  'clients cannot claim server notification work'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.claim_due_general_alarm_notifications()',
    'execute'
  ),
  'only the service dispatcher can claim notification work'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_general_alarm_notification_attempts(bigint[],boolean,text)',
    'execute'
  ),
  'only the service dispatcher can complete notification work'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '60000000-0000-0000-0000-000000000001',
    'phase10-alarm-admin@example.invalid',
    '{"display_name":"Phase 10 Alarm Admin"}'::jsonb
  ),
  (
    '60000000-0000-0000-0000-000000000002',
    'phase10-alarm-user@example.invalid',
    '{"display_name":"Phase 10 Alarm User"}'::jsonb
  ),
  (
    '60000000-0000-0000-0000-000000000003',
    'phase10-alarm-other@example.invalid',
    '{"display_name":"Phase 10 Alarm Other"}'::jsonb
  );

update public.profiles
set role = 'admin'
where user_id = '60000000-0000-0000-0000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$ select public.admin_create_trip('Phase 10 Generalalarm') $$,
  'an admin creates the alarm trip'
);
select lives_ok(
  $$
    select public.admin_create_trip_bus(
      (select id from public.trips where archived_at is null),
      'Bus 2'
    )
  $$,
  'an admin creates the alarm bus'
);
select lives_ok(
  $$
    select public.admin_upsert_trip_participant(
      (select id from public.trips where archived_at is null),
      'BER17',
      'Generalalarm Teilnehmer',
      '60000000-0000-0000-0000-000000000002',
      (select id from public.trip_buses where name = 'Bus 2')
    )
  $$,
  'an admin links the physical participant to the app account'
);
-- New clients cannot start boarding; exercise historical server data as owner.
reset role;
select lives_ok(
  $$
    select public.admin_start_bus_boarding(
      (select id from public.trips where archived_at is null),
      'Abfahrt in 15 Minuten',
      now() + interval '15 minutes'
    )
  $$,
  'a database-owner fixture retains legacy dispatcher coverage'
);
set local role authenticated;

reset role;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.register_push_notification_device(
      'ExponentPushToken[phase10validtoken0001]',
      'ios',
      'de'
    )
  $$,
  'a participant registers their own Expo push token through the RPC'
);
select throws_ok(
  $$ select count(*) from public.push_notification_devices $$,
  '42501',
  'permission denied for table push_notification_devices',
  'the participant cannot read back the registered token'
);
select throws_ok(
  $$
    select public.register_push_notification_device(
      'not-a-push-token',
      'ios',
      'de'
    )
  $$,
  '23514',
  null,
  'invalid push tokens fail the table constraint'
);
select throws_ok(
  $$
    select public.admin_escalate_bus_boarding_participant(
      (select id from public.bus_boardings where closed_at is null),
      (select id from public.trip_participants where participant_code = 'BER17')
    )
  $$,
  '42501',
  'Admin access required.',
  'a participant cannot create a manual escalation'
);
select lives_ok(
  $$
    select public.respond_to_bus_boarding(
      (select id from public.bus_boardings where closed_at is null),
      (select id from public.trip_participants where participant_code = 'BER17'),
      'read'::public.bus_boarding_status
    )
  $$,
  'the participant records the explicit read acknowledgement'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-0000-0000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select public.admin_escalate_bus_boarding_participant(
      (select id from public.bus_boardings where closed_at is null),
      (select id from public.trip_participants where participant_code = 'BER17')
    )
  $$,
  'an admin manually escalates the outstanding participant'
);
select is(
  (select count(*) from public.bus_boarding_escalations),
  1::bigint,
  'the admin can read the single manual escalation'
);
select is(
  (
    select escalated_by_display_name
    from public.bus_boarding_escalations
  ),
  'Phase 10 Alarm Admin',
  'the escalation captures the responsible leader name'
);

reset role;
set local session_replication_role = replica;
update public.bus_boarding_responses
set updated_at = now() - interval '6 minutes'
where participant_id = (
  select id from public.trip_participants where participant_code = 'BER17'
);
set local session_replication_role = origin;

set local role service_role;
select is(
  public.can_dispatch_general_alarm('60000000-0000-0000-0000-000000000001'),
  true,
  'the service can verify an admin dispatcher'
);
select is(
  public.can_dispatch_general_alarm('60000000-0000-0000-0000-000000000002'),
  false,
  'the service rejects a normal user as dispatcher'
);
select is(
  (
    with claimed as materialized (
      select * from public.claim_due_general_alarm_notifications()
    ),
    completed as materialized (
      select public.complete_general_alarm_notification_attempts(
        array_agg(claimed.attempt_id),
        true,
        ''
      )
      from claimed
    )
    select claimed.expected_status
    from claimed
    cross join completed
    limit 1
  ),
  'on_way'::public.bus_boarding_status,
  'the due claim requests the next on-way status after five minutes'
);
select is(
  (select count(*) from public.claim_due_general_alarm_notifications()),
  0::bigint,
  'the same five-minute delivery slot cannot be claimed twice'
);
reset role;
select is(
  (
    select count(*)
    from public.general_alarm_notification_attempts
    where accepted_at is not null
  ),
  1::bigint,
  'the accepted notification attempt is retained for diagnostics'
);

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;
select lives_ok(
  $$
    select public.unregister_push_notification_device(
      'ExponentPushToken[phase10validtoken0001]'
    )
  $$,
  'the participant unregisters only the current device token'
);

reset role;
select is(
  (select count(*) from public.push_notification_devices),
  0::bigint,
  'unregistering deletes the private token and cascades its attempt log'
);

select * from finish();

rollback;
