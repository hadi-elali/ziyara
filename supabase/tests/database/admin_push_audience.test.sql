begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Rollback-only fixtures; no network request or actual push is performed.
delete from public.push_notification_devices;
insert into auth.users(id, email, raw_user_meta_data) values
  ('85000000-0000-0000-0000-000000000001','audience-admin@example.invalid','{"display_name":"Audience Admin","name":"Audience","surname":"Admin","age":30,"member_type":"sister"}'),
  ('85000000-0000-0000-0000-000000000002','audience-brother@example.invalid','{"display_name":"Audience Brother","name":"Audience","surname":"Brother","age":30,"member_type":"brother"}'),
  ('85000000-0000-0000-0000-000000000003','audience-sister@example.invalid','{"display_name":"Audience Sister","name":"Audience","surname":"Sister","age":30,"member_type":"sister"}'),
  ('85000000-0000-0000-0000-000000000004','audience-unknown@example.invalid','{"display_name":"Audience Unknown","name":"Audience","surname":"Unknown","age":30}'),
  ('85000000-0000-0000-0000-000000000005','audience-no-device@example.invalid','{"display_name":"Without Device","name":"Without","surname":"Device","age":30,"member_type":"brother"}');
update public.profiles set role = 'admin' where user_id = '85000000-0000-0000-0000-000000000001';
insert into public.push_notification_devices(profile_id, expo_push_token, platform)
  select p.id, 'ExpoPushToken[audiencefixture'||v.n||']', v.platform
  from (values
    ('85000000-0000-0000-0000-000000000001'::uuid,1,'ios'),
    ('85000000-0000-0000-0000-000000000002'::uuid,2,'ios'),
    ('85000000-0000-0000-0000-000000000002'::uuid,3,'android'),
    ('85000000-0000-0000-0000-000000000003'::uuid,4,'ios'),
    ('85000000-0000-0000-0000-000000000004'::uuid,5,'android')
  ) v(user_id,n,platform) join public.profiles p on p.user_id = v.user_id;

select ok(not has_function_privilege('anon','public.admin_prepare_push_message(text,text,text)','execute'),'anonymous callers cannot prepare targeted messages');
select ok(not has_function_privilege('authenticated','public.claim_admin_push_notifications(bigint,uuid)','execute'),'targeting does not expose token claims');
select ok(not has_table_privilege('authenticated','public.admin_push_messages','update'),'clients cannot change a saved audience directly');
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.admin_prepare_push_message('Title','Body','brother')$$,'42501',null,'normal accounts cannot create targeted messages');
reset role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.admin_prepare_push_message('Title','Body','all')$$,'42501',null,'missing session cannot prepare a message');
select set_config('request.jwt.claim.sub','85000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select throws_ok($$select public.admin_prepare_push_message('Title','Body',null)$$,'22023',null,'null audience is rejected rather than broadcast');
select throws_ok($$select public.admin_prepare_push_message('Title','Body','unknown')$$,'22023',null,'invalid audience is rejected rather than broadcast');
select throws_ok($$select public.admin_prepare_push_message('','Body','sister')$$,'23514',null,'targeted messages retain title validation');
select set_config('test.audience_all',public.admin_prepare_push_message('All','Body','all')::text,true);
select set_config('test.audience_legacy',public.admin_prepare_push_message('Legacy','Body')::text,true);
select set_config('test.audience_brother',public.admin_prepare_push_message('Brothers','Body','brother')::text,true);
select set_config('test.audience_sister',public.admin_prepare_push_message('Sisters','Body','sister')::text,true);
reset role;
set local role service_role;
select is((select audience from public.admin_push_messages where id=current_setting('test.audience_brother')::bigint),'brother','brother selection is persisted');
select is((select audience from public.admin_push_messages where id=current_setting('test.audience_sister')::bigint),'sister','sister selection is persisted');
select is((select audience from public.admin_push_messages where id=current_setting('test.audience_legacy')::bigint),'all','older two-argument callers retain all recipients');
select throws_ok($$update public.admin_push_messages set audience='invalid' where id=current_setting('test.audience_all')::bigint$$,'23514',null,'table constraint also rejects invalid audiences');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_all')::bigint,'85000000-0000-0000-0000-000000000001')),5::bigint,'all includes both genders, unknown accounts and both platforms');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_brother')::bigint,'85000000-0000-0000-0000-000000000001')),2::bigint,'brother audience includes only both devices of the brother');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_sister')::bigint,'85000000-0000-0000-0000-000000000001')),2::bigint,'sister audience includes the matching admin and normal account');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_legacy')::bigint,'85000000-0000-0000-0000-000000000001')),5::bigint,'legacy requests still dispatch to everyone');
select is((select count(*) from public.admin_push_notification_attempts a join public.profiles p on p.id=a.recipient_profile_id where a.message_id=current_setting('test.audience_brother')::bigint and p.member_type is distinct from 'brother'::public.member_type),0::bigint,'no sister or unassigned account leaks into brother snapshot');
select is((select count(*) from public.admin_push_notification_attempts a join public.profiles p on p.id=a.recipient_profile_id where a.message_id=current_setting('test.audience_sister')::bigint and p.member_type is distinct from 'sister'::public.member_type),0::bigint,'no brother or unassigned account leaks into sister snapshot');
select is((select count(*) from public.admin_push_notification_attempts a join public.profiles p on p.id=a.recipient_profile_id where a.message_id=current_setting('test.audience_all')::bigint and p.member_type is null),1::bigint,'unassigned account receives only an all-audience message');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_brother')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'targeted retries never reclaim attempted devices');
select throws_ok($$select * from public.claim_admin_push_notifications(current_setting('test.audience_sister')::bigint,'85000000-0000-0000-0000-000000000002')$$,'42501',null,'targeting preserves the dispatch admin check');
delete from public.push_notification_devices where profile_id=(select id from public.profiles where user_id='85000000-0000-0000-0000-000000000002');
reset role;
set local role authenticated;
select set_config('test.audience_empty',public.admin_prepare_push_message('Empty','Body','brother')::text,true);
reset role;
set local role service_role;
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_empty')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'no matching devices never falls back to other audiences');
select is((select count(*) from public.admin_push_notification_attempts where message_id=current_setting('test.audience_empty')::bigint),0::bigint,'empty target creates no unrelated attempts');
reset role;
insert into public.push_notification_devices(profile_id,expo_push_token,platform)
  select p.id,'ExpoPushToken[audiencebatchfixture'||n||']','android'
  from public.profiles p cross join generate_series(1,101) n where p.user_id='85000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('test.audience_batch',public.admin_prepare_push_message('Batch','Body','brother')::text,true);
reset role;
set local role service_role;
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_batch')::bigint,'85000000-0000-0000-0000-000000000001')),100::bigint,'targeted messages retain 100-device batches');
reset role;
update public.profiles set member_type='sister' where user_id='85000000-0000-0000-0000-000000000002';
set local role service_role;
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_batch')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'changed assignments are excluded before their next batch');
select is((select count(*) from public.admin_push_notification_attempts where message_id=current_setting('test.audience_batch')::bigint and error_code='audience_changed'),1::bigint,'assignment change is recorded without retrying earlier devices');
select is((select count(*) from public.claim_admin_push_notifications(current_setting('test.audience_batch')::bigint,'85000000-0000-0000-0000-000000000001')),0::bigint,'changed audience does not expand or repeat a snapshot');
reset role;
select * from finish();
rollback;
