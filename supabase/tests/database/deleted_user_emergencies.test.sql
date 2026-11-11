begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_trigger('public', 'profiles', 'remove_profile_active_emergencies',
  'profile deletion cleans up active emergencies');
select ok(not has_function_privilege('anon', 'public.remove_profile_active_emergencies()', 'execute'),
  'anonymous callers cannot invoke the cleanup function');
select ok(not has_function_privilege('authenticated', 'public.remove_profile_active_emergencies()', 'execute'),
  'clients cannot invoke the cleanup function');
select ok(not has_table_privilege('authenticated', 'public.emergency_requests', 'delete'),
  'direct emergency deletion remains unavailable to clients');

insert into auth.users(id, email, raw_user_meta_data) values
  ('a2300000-0000-0000-0000-000000000001', 'em-delete-admin@example.invalid', '{"display_name":"Emergency Admin"}'),
  ('a2300000-0000-0000-0000-000000000002', 'em-delete-target@example.invalid', '{"display_name":"Deleted Sender"}'),
  ('a2300000-0000-0000-0000-000000000003', 'em-delete-other@example.invalid', '{"display_name":"Other Sender"}'),
  ('a2300000-0000-0000-0000-000000000004', 'em-delete-medical@example.invalid', '{"display_name":"Medical Recipient"}'),
  ('a2300000-0000-0000-0000-000000000005', 'em-delete-self@example.invalid', '{"display_name":"Self Deletion"}'),
  ('a2300000-0000-0000-0000-000000000006', 'em-delete-profile@example.invalid', '{"display_name":"Profile Deletion"}');
update public.profiles set role = case user_id
  when 'a2300000-0000-0000-0000-000000000001'::uuid then 'admin'::public.app_role
  when 'a2300000-0000-0000-0000-000000000004'::uuid then 'medical_staff'::public.app_role
  else 'user'::public.app_role end
where user_id::text like 'a2300000-%';

create temporary table deletion_emergencies (name text primary key, id bigint not null);
grant select, insert on deletion_emergencies to authenticated;

select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000002', true);
set local role authenticated;
insert into deletion_emergencies select 'medical', request_id
  from public.submit_emergency_request('medical', 'Open medical request', 'Test lobby');
insert into deletion_emergencies select 'travel', request_id
  from public.submit_emergency_request('travel', 'Open travel request', 'Test bus');
insert into deletion_emergencies select 'completed', request_id
  from public.submit_emergency_request('medical', 'Completed medical request', 'Test lobby');

select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000003', true);
insert into deletion_emergencies select 'unrelated', request_id
  from public.submit_emergency_request('medical', 'Unrelated open request', 'Other lobby');
insert into deletion_emergencies select 'completed-by-target', request_id
  from public.submit_emergency_request('travel', 'Other completed request', 'Other bus');

select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000001', true);
select public.complete_emergency_request(id) from deletion_emergencies where name = 'completed';
reset role;
-- A retained request completed by the deleted person must also survive.
update public.emergency_requests set completed_at = '2026-11-01 12:00:00+00',
  completed_by_profile_id = (select id from public.profiles where user_id = 'a2300000-0000-0000-0000-000000000002')
where id = (select id from deletion_emergencies where name = 'completed-by-target');

insert into public.push_notification_devices(profile_id, expo_push_token, platform)
select id, 'ExpoPushToken[deleted-sender-recipient]', 'ios' from public.profiles
where user_id = 'a2300000-0000-0000-0000-000000000004';
insert into public.emergency_notification_attempts(request_id, recipient_profile_id, push_device_id)
select e.id, d.profile_id, d.id from deletion_emergencies e
cross join public.push_notification_devices d
where e.name in ('medical', 'completed', 'unrelated')
  and d.expo_push_token = 'ExpoPushToken[deleted-sender-recipient]';

select is((select count(*)::int from public.emergency_notification_attempts
  where request_id in (select id from deletion_emergencies)), 3, 'push-attempt fixtures exist');
select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000004', true);
set local role authenticated;
select throws_ok($$select public.admin_delete_user('a2300000-0000-0000-0000-000000000002')$$,
  '42501', 'Admin access required.', 'unauthorized deletion is still rejected');
select is((select count(*)::int from public.list_my_emergency_messages()
  where request_id in (select id from deletion_emergencies where name in ('medical', 'travel'))),
  1, 'rejected account deletion preserves the visible active emergency');

select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000001', true);
select is(public.admin_delete_user('a2300000-0000-0000-0000-000000000002'),
  'a2300000-0000-0000-0000-000000000002'::uuid, 'admin account deletion succeeds');
select is((select count(*)::int from public.list_emergency_dashboard()
  where request_id in (select id from deletion_emergencies where name in ('medical', 'travel'))),
  0, 'deleted sender has no active requests in the dashboard');
select is((select count(*)::int from public.list_emergency_dashboard()
  where request_id = (select id from deletion_emergencies where name = 'completed')),
  1, 'completed sender history remains in the dashboard');

select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000004', true);
select is((select count(*)::int from public.list_my_emergency_messages()
  where request_id in (select id from deletion_emergencies where name in ('medical', 'travel'))),
  0, 'active requests also disappear from recipient inboxes');
-- Same join and filters as the Home unread indicator.
select is((select count(*)::int from public.emergency_request_recipients r
  join public.emergency_requests e on e.id = r.request_id
  where r.read_at is null and e.completed_at is null
    and e.id in (select id from deletion_emergencies where name in ('medical', 'travel'))),
  0, 'deleted sender no longer contributes to the unread Home alert');
reset role;

select is((select count(*)::int from public.emergency_requests
  where id in (select id from deletion_emergencies where name in ('medical', 'travel'))),
  0, 'both medical and travel active requests are removed');
select is((select count(*)::int from public.emergency_request_recipients
  where request_id in (select id from deletion_emergencies where name in ('medical', 'travel'))),
  0, 'deleted active requests leave no recipients');
select is((select count(*)::int from public.emergency_notification_attempts
  where request_id in (select id from deletion_emergencies where name in ('medical', 'travel'))),
  0, 'deleted active requests leave no private push attempts');
select ok((select requester_profile_id is null and completed_at is not null
  from public.emergency_requests where id = (select id from deletion_emergencies where name = 'completed')),
  'completed history survives without the deleted requester reference');
select is((select count(*)::int from public.emergency_notification_attempts
  where request_id = (select id from deletion_emergencies where name = 'completed')),
  1, 'completed history retains its push log');
select ok((select completed_by_profile_id is null and completed_at = '2026-11-01 12:00:00+00'::timestamptz
  from public.emergency_requests where id = (select id from deletion_emergencies where name = 'completed-by-target')),
  'deleting the completing person only clears the actor reference');
select ok((select requester_profile_id is not null and completed_at is null
  from public.emergency_requests where id = (select id from deletion_emergencies where name = 'unrelated')),
  'another sender retains their active emergency');
select is((select count(*)::int from public.emergency_notification_attempts
  where request_id = (select id from deletion_emergencies where name = 'unrelated')),
  1, 'another sender retains their push log');

-- The self-service Edge Function deletes auth.users using the Auth Admin API.
select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000005', true);
set local role authenticated;
insert into deletion_emergencies select 'self', request_id
  from public.submit_emergency_request('medical', 'Self-deletion request', 'Test lobby');
reset role;
delete from auth.users where id = 'a2300000-0000-0000-0000-000000000005';
select is((select count(*)::int from public.emergency_requests
  where id = (select id from deletion_emergencies where name = 'self')),
  0, 'self-service Auth deletion also removes active emergencies');

select set_config('request.jwt.claim.sub', 'a2300000-0000-0000-0000-000000000006', true);
set local role authenticated;
insert into deletion_emergencies select 'profile', request_id
  from public.submit_emergency_request('travel', 'Profile-deletion request', 'Test bus');
reset role;
delete from public.profiles where user_id = 'a2300000-0000-0000-0000-000000000006';
select is((select count(*)::int from public.emergency_requests
  where id = (select id from deletion_emergencies where name = 'profile')),
  0, 'direct profile deletion also removes active emergencies');

delete from auth.users where id = 'a2300000-0000-0000-0000-000000000004';
select ok((select requester_profile_id is not null and completed_at is null
  from public.emergency_requests where id = (select id from deletion_emergencies where name = 'unrelated')),
  'deleting a recipient does not remove another sender''s active request');

select * from finish();
rollback;
