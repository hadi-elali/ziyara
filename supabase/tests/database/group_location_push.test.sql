begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

insert into auth.users(id,email,raw_user_meta_data)
select ('84000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'location-push-' || n || '@example.invalid',
       jsonb_build_object('display_name','Location push ' || n)
from generate_series(1,6) n;
update public.profiles set role='admin' where user_id='84000000-0000-0000-0000-000000000001';
insert into public.push_notification_devices(profile_id,expo_push_token,platform,locale)
select p.id,'ExpoPushToken[locationpush' || n || locale || '12345678]','ios',locale
from generate_series(1,5) n cross join (values('de'),('en'),('ar')) l(locale)
join public.profiles p on p.user_id=('84000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
where n=2 or locale='de';

select ok(not has_table_privilege('authenticated','public.group_location_push_attempts','select'),'attempts are private for authenticated accounts');
select ok(not has_table_privilege('anon','public.group_location_push_attempts','select'),'attempts are private for anonymous visitors');
select ok(not has_function_privilege('authenticated','public.claim_group_location_notifications(bigint,uuid)','execute'),'clients cannot claim pushes');
select ok(not has_function_privilege('anon','public.claim_group_location_notifications(bigint,uuid)','execute'),'anonymous visitors cannot claim pushes');
select ok(has_function_privilege('service_role','public.claim_group_location_notifications(bigint,uuid)','execute'),'service can claim pushes');
select ok(not has_function_privilege('authenticated','public.prepare_group_location_notification()','execute'),'snapshot trigger is private');

select set_config('request.jwt.claim.sub','84000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select set_config('test.group',(public.admin_save_organization_group(
  'Location push group',
  array['84000000-0000-0000-0000-000000000002','84000000-0000-0000-0000-000000000003','84000000-0000-0000-0000-000000000006']::uuid[],
  array['84000000-0000-0000-0000-000000000004']::uuid[]
)).id::text,true);
select throws_ok($$select public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000004')$$,'P0002','Group leader not found.','ordinary members cannot be targeted');
select set_config('request.jwt.claim.sub','84000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000002')$$,'42501','Admin access required.','ordinary members cannot request location pushes');
select set_config('request.jwt.claim.sub','84000000-0000-0000-0000-000000000001',true);
select set_config('test.request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000002')).id::text,true);
select set_config('test.other_request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000003')).id::text,true);
reset role;
select is((select count(*) from public.group_location_push_attempts where request_id=current_setting('test.request')::bigint),3::bigint,'snapshot includes all three devices of the addressed leader');
select is((select count(*) from public.group_location_push_attempts where request_id=current_setting('test.other_request')::bigint),1::bigint,'another leader has a separate snapshot');
select is((select count(*) from public.group_location_push_attempts a join public.profiles p on p.id=a.recipient_profile_id where a.request_id=current_setting('test.request')::bigint and p.user_id<>'84000000-0000-0000-0000-000000000002'),0::bigint,'admins, other leaders, members and outsiders are excluded');

set local role service_role;
select throws_ok($$select * from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000002')$$,'42501','Admin access required.','claim independently checks the requester role');
create temporary table location_claims as select * from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001');
select is((select count(*) from location_claims),3::bigint,'service claims only the addressed devices');
select is((select count(*) from location_claims where title in ('Standort angefragt','Location requested','طلب مشاركة الموقع')),3::bigint,'notification titles use German, English and Arabic device locales');
select is((select count(*) from location_claims where body in (
  'Das Reiseteam bittet dich, deinen Standort einmalig zu teilen. Öffne deine Gruppe, um zuzustimmen oder abzulehnen.',
  'The travel team asks you to share your location once. Open your group to accept or decline.',
  'يطلب منك فريق الرحلة مشاركة موقعك مرة واحدة. افتح مجموعتك للموافقة أو الرفض.'
)),3::bigint,'localized messages ask for consent');
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'repeated dispatch never reclaims uncertain attempts');
reset role;
select is((select count(*) from public.organization_group_location_requests where id=current_setting('test.request')::bigint and status='pending' and latitude is null and longitude is null),1::bigint,'push does not share coordinates or change consent');

set local role authenticated;
select set_config('test.old_request',current_setting('test.request'),true);
select set_config('test.request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000002')).id::text,true);
reset role;
select is((select count(*) from public.group_location_push_attempts where request_id=current_setting('test.old_request')::bigint),0::bigint,'replacement deletes old attempts');
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.old_request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'delayed dispatch of replaced request does nothing');
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),3::bigint,'an explicit new request can notify the same devices again');

set local role authenticated;
select set_config('test.request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000002')).id::text,true);
select set_config('request.jwt.claim.sub','84000000-0000-0000-0000-000000000002',true);
select public.respond_to_organization_group_location(current_setting('test.request')::bigint,false);
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'declined requests no longer send pushes');
set local role authenticated;
select set_config('request.jwt.claim.sub','84000000-0000-0000-0000-000000000001',true);
select set_config('test.request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000002')).id::text,true);
select set_config('request.jwt.claim.sub','84000000-0000-0000-0000-000000000002',true);
select public.respond_to_organization_group_location(current_setting('test.request')::bigint,true,32.6,44.0,10);
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'answered requests no longer send pushes');

reset role;
delete from public.push_notification_devices where profile_id=(select id from public.profiles where user_id='84000000-0000-0000-0000-000000000003');
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.other_request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'unregistered devices are skipped');
select is((select count(*) from public.group_location_push_attempts where request_id=current_setting('test.other_request')::bigint and error_code='device_unregistered'),1::bigint,'unregistered exclusion is recorded without a token');

set local role authenticated;
select set_config('request.jwt.claim.sub','84000000-0000-0000-0000-000000000001',true);
select set_config('test.empty_request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000006')).id::text,true);
reset role;
insert into public.push_notification_devices(profile_id,expo_push_token,platform)
select id,'ExpoPushToken[locationpushlater12345678]','android' from public.profiles where user_id='84000000-0000-0000-0000-000000000006';
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.empty_request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'an empty snapshot is never backfilled');

set local role authenticated;
select set_config('test.request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000002')).id::text,true);
reset role;
update public.push_notification_devices set profile_id=(select id from public.profiles where user_id='84000000-0000-0000-0000-000000000005')
where profile_id=(select id from public.profiles where user_id='84000000-0000-0000-0000-000000000002') and locale='en';
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),2::bigint,'a device reassigned to another account is excluded');

set local role authenticated;
select public.admin_save_organization_group('Location push group',array['84000000-0000-0000-0000-000000000003','84000000-0000-0000-0000-000000000006']::uuid[],array['84000000-0000-0000-0000-000000000004']::uuid[],'{}',current_setting('test.group')::bigint);
reset role;
select is((select count(*) from public.group_location_push_attempts where request_id in (
  current_setting('test.request')::bigint, current_setting('test.old_request')::bigint,
  current_setting('test.other_request')::bigint, current_setting('test.empty_request')::bigint
)),0::bigint,'membership changes delete outstanding notification attempts');
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'a former leader is no longer notified');

reset role;
delete from public.push_notification_devices where profile_id=(select id from public.profiles where user_id='84000000-0000-0000-0000-000000000006');
insert into public.push_notification_devices(profile_id,expo_push_token,platform)
select p.id,'ExpoPushToken[locationpushbatch' || n || '12345678]','android'
from public.profiles p cross join generate_series(1,101) n where p.user_id='84000000-0000-0000-0000-000000000006';
set local role authenticated;
select set_config('test.request',(public.admin_request_organization_group_location(current_setting('test.group')::bigint,'84000000-0000-0000-0000-000000000006')).id::text,true);
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),100::bigint,'claims respect the Expo batch limit');
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),1::bigint,'the next claim resumes remaining devices');
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'all batch claims remain idempotent');
set local role authenticated;
select public.admin_delete_organization_group(current_setting('test.group')::bigint);
reset role;
select is((select count(*) from public.group_location_push_attempts where request_id=current_setting('test.request')::bigint),0::bigint,'group deletion removes its attempts');
set local role service_role;
select is((select count(*) from public.claim_group_location_notifications(current_setting('test.request')::bigint,'84000000-0000-0000-0000-000000000001')),0::bigint,'deleted groups cannot trigger delayed pushes');

select * from finish();
rollback;
