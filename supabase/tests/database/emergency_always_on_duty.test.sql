begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select ok(
  to_regprocedure('public.admin_set_emergency_duty(uuid,boolean)') is null,
  'the individual emergency-duty assignment RPC no longer exists'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.submit_emergency_request(text,text,text,double precision,double precision,double precision)',
    'execute'
  ),
  'authenticated users can still submit emergency requests'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '74000000-0000-0000-0000-000000000001',
    'emergency-admin@example.invalid',
    '{"display_name":"Emergency Admin"}'::jsonb
  ),
  (
    '74000000-0000-0000-0000-000000000002',
    'emergency-sender@example.invalid',
    '{"display_name":"Emergency Sender"}'::jsonb
  ),
  (
    '74000000-0000-0000-0000-000000000003',
    'emergency-medical-one@example.invalid',
    '{"display_name":"Medical One"}'::jsonb
  ),
  (
    '74000000-0000-0000-0000-000000000004',
    'emergency-medical-two@example.invalid',
    '{"display_name":"Medical Two"}'::jsonb
  ),
  (
    '74000000-0000-0000-0000-000000000005',
    'emergency-travel@example.invalid',
    '{"display_name":"Travel Team"}'::jsonb
  );

update public.profiles
set role = case user_id
  when '74000000-0000-0000-0000-000000000001'::uuid then 'admin'::public.app_role
  when '74000000-0000-0000-0000-000000000003'::uuid then 'medical_staff'::public.app_role
  when '74000000-0000-0000-0000-000000000004'::uuid then 'medical_staff'::public.app_role
  when '74000000-0000-0000-0000-000000000005'::uuid then 'organization_team'::public.app_role
  else role
end;

insert into public.emergency_team_duties (
  profile_id,
  team,
  assigned_by_profile_id,
  assigned_by_display_name
)
select
  medical.id,
  'medical',
  admin.id,
  admin.display_name
from public.profiles as medical
cross join public.profiles as admin
where medical.user_id = '74000000-0000-0000-0000-000000000003'
  and admin.user_id = '74000000-0000-0000-0000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '74000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  (
    select submitted.recipient_count
    from public.submit_emergency_request(
      'medical',
      'Medical help is needed.',
      'Hotel lobby'
    ) as submitted
  ),
  3,
  'every medical-team member and administrator receives the request despite a legacy individual assignment'
);

reset role;

select results_eq(
  $$
    select profiles.user_id
    from public.emergency_request_recipients as recipients
    join public.emergency_requests as requests on requests.id = recipients.request_id
    join public.profiles as profiles on profiles.id = recipients.recipient_profile_id
    where requests.requester_profile_id = (
      select sender.id
      from public.profiles as sender
      where sender.user_id = '74000000-0000-0000-0000-000000000002'
    )
      and requests.target_team = 'medical'
    order by profiles.user_id
  $$,
  $$
    values
      ('74000000-0000-0000-0000-000000000001'::uuid),
      ('74000000-0000-0000-0000-000000000003'::uuid),
      ('74000000-0000-0000-0000-000000000004'::uuid)
  $$,
  'the medical recipient rows contain the administrator and both medical-team profiles'
);

select set_config(
  'request.jwt.claim.sub',
  '74000000-0000-0000-0000-000000000002',
  true
);
set local role authenticated;

select is(
  (
    select submitted.recipient_count
    from public.submit_emergency_request(
      'travel',
      'Travel-team help is needed.',
      'Bus parking area'
    ) as submitted
  ),
  2,
  'every organization-team member and administrator receives the matching request'
);

reset role;

select results_eq(
  $$
    select profiles.user_id
    from public.emergency_request_recipients as recipients
    join public.emergency_requests as requests on requests.id = recipients.request_id
    join public.profiles as profiles on profiles.id = recipients.recipient_profile_id
    where requests.requester_profile_id = (
      select sender.id
      from public.profiles as sender
      where sender.user_id = '74000000-0000-0000-0000-000000000002'
    )
      and requests.target_team = 'travel'
    order by profiles.user_id
  $$,
  $$
    values
      ('74000000-0000-0000-0000-000000000001'::uuid),
      ('74000000-0000-0000-0000-000000000005'::uuid)
  $$,
  'the organization-team recipient rows contain the administrator and team profile'
);

select * from finish();

rollback;
