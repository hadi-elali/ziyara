begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(id,email,raw_user_meta_data)
select ('81000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'organization-check-' || n || '@example.invalid',
       jsonb_build_object('display_name','Organization check ' || n)
from generate_series(1,6) n;
update public.profiles set role='admin' where user_id='81000000-0000-0000-0000-000000000001';
insert into public.account_families(name) values('Organization check family');
update public.profiles set family_id=(select id from public.account_families where name='Organization check family')
where user_id in ('81000000-0000-0000-0000-000000000004','81000000-0000-0000-0000-000000000005');
select set_config('test.family',(select id::text from public.account_families where name='Organization check family'),true);
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
set local role authenticated;

select set_config('test.group',(public.admin_save_organization_group(
  'Independent check group',
  array['81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000003']::uuid[],
  '{}'::uuid[], array[current_setting('test.family')::bigint]
)).id::text,true);
select is((select count(*) from public.organization_group_members where group_id=current_setting('test.group')::bigint),4::bigint,'leaders and the whole family are assigned without trip participants');
select is((select count(*) from public.organization_group_members where group_id=current_setting('test.group')::bigint and is_leader),2::bigint,'multiple group admins are supported');
select throws_ok($$select public.admin_request_organization_group_location(current_setting('test.group')::bigint,'81000000-0000-0000-0000-000000000004')$$,'P0002','Group leader not found.','ordinary members cannot be location targets');
select set_config('test.request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'81000000-0000-0000-0000-000000000002')).id::text,true);
select set_config('test.other_request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'81000000-0000-0000-0000-000000000003')).id::text,true);

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000004',true);
select is((select count(*) from public.organization_groups where id=current_setting('test.group')::bigint),1::bigint,'a family account sees its group');
select is((select count(*) from public.organization_group_location_requests),0::bigint,'ordinary members cannot read location requests');
select throws_ok($$select public.admin_start_wake_up_call('Not allowed')$$,'42501','Admin access required.','members cannot send wake-up calls');
select throws_ok($$select public.admin_save_organization_group('Not allowed','{}'::uuid[],'{}'::uuid[])$$,'42501','Admin access required.','members cannot change group roles');

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.organization_group_location_requests),1::bigint,'a leader only sees their own request');
select throws_ok($$select public.respond_to_organization_group_location(current_setting('test.other_request')::bigint,true,32.6,44.0)$$,'P0002','Pending location request not found.','a leader cannot answer for another leader');
select lives_ok($$select public.respond_to_organization_group_location(current_setting('test.request')::bigint,true,32.6,44.0,10)$$,'target leader explicitly shares one location');
reset role;
update public.organization_group_location_requests set location_expires_at=now()-interval '1 second' where id=current_setting('test.request')::bigint;
set local role authenticated;
select is((select count(*) from public.organization_group_location_requests),0::bigint,'expired coordinates are hidden by RLS');

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.organization_groups where id=current_setting('test.group')::bigint),0::bigint,'outsiders cannot read a group');

select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
-- Isolate this test from an existing local call without persisting any change.
reset role;
update public.wake_up_calls set closed_at=now() where closed_at is null;
set local role authenticated;
select set_config('test.call',(public.admin_start_wake_up_call('Guten Morgen')).id::text,true);
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000006',true);
select is((select count(*) from public.wake_up_calls where id=current_setting('test.call')::bigint),1::bigint,'an account without a group or bus receives the wake-up call');
select lives_ok($$select public.acknowledge_wake_up_call(current_setting('test.call')::bigint)$$,'wake-up call needs only one acknowledgement');
select is((select count(*) from public.wake_up_call_recipients where call_id=current_setting('test.call')::bigint and acknowledged_at is not null),1::bigint,'members can read only their own acknowledgement');
select ok(not has_table_privilege('authenticated','public.wake_up_notification_attempts','select'),'push attempts stay private');
select ok(not has_function_privilege('authenticated','public.claim_wake_up_notifications(bigint,uuid)','execute'),'push claims are service-only');
reset role;
insert into public.push_notification_devices(profile_id,expo_push_token,platform)
select id,'ExpoPushToken[organizationcheck1234567890]','ios' from public.profiles where user_id='81000000-0000-0000-0000-000000000002';
set local role service_role;
select cmp_ok((select count(*) from public.claim_wake_up_notifications(current_setting('test.call')::bigint,'81000000-0000-0000-0000-000000000001')),'>',0::bigint,'service claims registered devices for the call');
select is((select count(*) from public.claim_wake_up_notifications(current_setting('test.call')::bigint,'81000000-0000-0000-0000-000000000001')),0::bigint,'each device is claimed only once');
set local role authenticated;
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000001',true);
select public.admin_close_wake_up_call(current_setting('test.call')::bigint);
select set_config('request.jwt.claim.sub','81000000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.acknowledge_wake_up_call(current_setting('test.call')::bigint)$$,'P0002','Active wake-up call not found.','closed calls reject late acknowledgements');
select * from finish();
rollback;
