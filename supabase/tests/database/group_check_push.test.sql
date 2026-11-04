begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users(id,email,raw_user_meta_data)
select ('85000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
       'check-push-' || n || '@example.invalid',
       jsonb_build_object('display_name','Check push ' || n)
from generate_series(1,5) n;
update public.profiles set role='admin' where user_id='85000000-0000-0000-0000-000000000001';
update public.profiles set role='scholar' where user_id='85000000-0000-0000-0000-000000000003';
insert into public.push_notification_devices(profile_id,expo_push_token,platform,locale)
select p.id,'ExpoPushToken[checkpush' || n || locale || '12345678]','ios',locale
from generate_series(1,3) n cross join (values('de'),('en'),('ar')) l(locale)
join public.profiles p on p.user_id=('85000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid
where n=2 or locale='de';

select ok(not has_table_privilege('authenticated','public.group_check_push_attempts','select'),'attempts are private for clients');
select ok(not has_table_privilege('anon','public.group_check_push_attempts','select'),'attempts are private for anonymous visitors');
select ok(not has_function_privilege('authenticated','public.claim_group_check_notifications(bigint,uuid)','execute'),'clients cannot claim');
select ok(not has_function_privilege('anon','public.claim_group_check_notifications(bigint,uuid)','execute'),'anonymous visitors cannot claim');
select ok(has_function_privilege('service_role','public.claim_group_check_notifications(bigint,uuid)','execute'),'service can claim');
select ok(not has_function_privilege('authenticated','public.prepare_group_check_notification()','execute'),'snapshot trigger is private');

select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.start_group_check('Sind alle da?')$$,'42501','Admin access required.','ordinary accounts cannot start a check');
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select set_config('test.check',(public.start_group_check('Sind alle da?')).id::text,true);
reset role;
select is((select count(*) from public.group_check_push_attempts where check_id=current_setting('test.check')::bigint),5::bigint,'snapshot includes every registered device, including admins');
insert into public.push_notification_devices(profile_id,expo_push_token,platform)
select id,'ExpoPushToken[checkpushlater12345678]','android' from public.profiles where user_id='85000000-0000-0000-0000-000000000004';
select is((select count(*) from public.group_check_push_attempts where check_id=current_setting('test.check')::bigint),5::bigint,'later registration does not backfill a check');
set local role service_role;
select throws_ok($$select * from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000003')$$,'42501','Admin access required.','scholars cannot dispatch');
select throws_ok($$select * from public.claim_group_check_notifications(99999999,'85000000-0000-0000-0000-000000000001')$$,'P0002','Group check not found.','unknown check is rejected');
create temporary table check_claims as select * from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001');
select is((select count(*) from check_claims),5::bigint,'all snapshotted devices are claimed');
select is((select count(distinct title) from check_claims),3::bigint,'titles use all three device locales');
select is((select count(distinct body) from check_claims),3::bigint,'bodies use all three device locales');
select is((select count(*) from check_claims where body like '%Sind alle da?%'),0::bigint,'lockscreen text does not expose the custom question');
select is((select count(*) from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'uncertain claims are never resent');

set local role authenticated;
select public.close_group_check(current_setting('test.check')::bigint);
select set_config('test.check',(public.start_group_check('Neue Frage?')).id::text,true);
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000002',true);
select public.respond_to_group_check(current_setting('test.check')::bigint,false);
reset role;
delete from public.push_notification_devices where profile_id=(select id from public.profiles where user_id='85000000-0000-0000-0000-000000000003');
update public.push_notification_devices set profile_id=(select id from public.profiles where user_id='85000000-0000-0000-0000-000000000005')
where expo_push_token='ExpoPushToken[checkpushlater12345678]';
set local role service_role;
select is((select count(*) from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')),1::bigint,'answered, unregistered and reassigned devices are skipped');
select is((select count(*) from public.group_check_push_attempts where check_id=current_setting('test.check')::bigint and error_code='already_answered'),3::bigint,'both yes and no are final answers for push eligibility');
select is((select count(*) from public.group_check_push_attempts where check_id=current_setting('test.check')::bigint and error_code='device_unregistered'),2::bigint,'device exclusions are recorded');

set local role authenticated;
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
select public.close_group_check(current_setting('test.check')::bigint);
select set_config('test.check',(public.start_group_check('Geschlossen?')).id::text,true);
select public.close_group_check(current_setting('test.check')::bigint);
set local role service_role;
select is((select count(*) from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'closed checks do not send');
reset role;
delete from public.push_notification_devices;
set local role authenticated;
select set_config('test.check',(public.start_group_check('Niemand registriert?')).id::text,true);
reset role;
insert into public.push_notification_devices(profile_id,expo_push_token,platform)
select p.id,'ExpoPushToken[checkpushbatch' || n || '12345678]','android'
from public.profiles p cross join generate_series(1,101) n where p.user_id='85000000-0000-0000-0000-000000000004';
set local role service_role;
select is((select count(*) from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'empty snapshots remain empty');
set local role authenticated;
select public.close_group_check(current_setting('test.check')::bigint);
select set_config('test.check',(public.start_group_check('Viele Geräte?')).id::text,true);
set local role service_role;
select is((select count(*) from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')),100::bigint,'batch size is at most 100');
select is((select count(*) from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')),1::bigint,'resume claims remaining device');
select is((select count(*) from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'repeated resume is idempotent');
reset role;
update public.profiles set role='user' where user_id='85000000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok($$select * from public.claim_group_check_notifications(current_setting('test.check')::bigint,'85000000-0000-0000-0000-000000000001')$$,'42501','Admin access required.','claim rechecks a revoked admin role');
reset role;
delete from public.group_checks where id=current_setting('test.check')::bigint;
select is((select count(*) from public.group_check_push_attempts where check_id=current_setting('test.check')::bigint),0::bigint,'deleting a check deletes its attempts');
select ok(not has_table_privilege('authenticated','public.group_check_push_attempts','insert'),'clients cannot add recipients');
select ok(not has_table_privilege('authenticated','public.group_check_push_attempts','update'),'clients cannot reset delivery attempts');
select ok(not has_table_privilege('authenticated','public.group_check_push_attempts','delete'),'clients cannot delete delivery attempts');

select * from finish();
rollback;
