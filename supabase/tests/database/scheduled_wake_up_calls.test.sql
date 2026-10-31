begin;
create extension if not exists pgtap with schema extensions;
select plan(33);
-- Transactional fixtures: no external push is sent and no test data is retained.
insert into auth.users(id,email,raw_user_meta_data) values
 ('82000000-0000-0000-0000-000000000001','schedule-admin@example.invalid','{"display_name":"Schedule Admin"}'),
 ('82000000-0000-0000-0000-000000000002','schedule-user@example.invalid','{"display_name":"Schedule User"}');
update public.profiles set role='admin' where user_id='82000000-0000-0000-0000-000000000001';
insert into public.push_notification_devices(profile_id,expo_push_token,platform)
select id,'ExpoPushToken[scheduledcheck1234567890]','ios' from public.profiles where user_id='82000000-0000-0000-0000-000000000002';

-- Exercise old/new installations together without any network delivery.
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select lives_ok($$select public.register_push_notification_device('ExpoPushToken[vibrationlegacy123456789]','android','de')$$,'legacy device registration still works');
select lives_ok($$select public.register_push_notification_device('ExpoPushToken[vibrationupgrade123456789]','android','en','wake-up-calls-v2')$$,'upgraded Android devices advertise their installed channel');
select throws_ok($$select public.register_push_notification_device('ExpoPushToken[vibrationinvalid123456789]','android','de','unknown-channel')$$,'22023','Invalid wake-up notification channel.','unknown channels are rejected');
select throws_ok($$select public.register_push_notification_device('ExpoPushToken[vibrationinvalid123456789]','ios','de','wake-up-calls-v2')$$,'22023','Invalid wake-up notification channel.','iOS cannot advertise the Android vibration channel');
select throws_ok($$select public.register_push_notification_device('ExpoPushToken[vibrationinvalid123456789]','android','de',null)$$,'22023','Invalid wake-up notification channel.','null channel capabilities are rejected');
select ok(not has_function_privilege('anon','public.register_push_notification_device(text,text,text,text)','execute'),'anonymous clients cannot register a channel');
select ok(not has_table_privilege('authenticated','public.push_notification_devices','select'),'channel capabilities never expose private devices to clients');
reset role;
select is((select count(*) from public.push_notification_devices where profile_id=(select id from public.profiles where user_id='82000000-0000-0000-0000-000000000002')),3::bigint,'registration keeps one row per device and invalid calls add nothing');
select is((select wake_up_channel_id from public.push_notification_devices where expo_push_token='ExpoPushToken[scheduledcheck1234567890]'),'wake-up-calls-v1','iOS retains the existing channel');
select is((select wake_up_channel_id from public.push_notification_devices where expo_push_token='ExpoPushToken[vibrationlegacy123456789]'),'wake-up-calls-v1','old Android clients retain the existing channel');
select is((select wake_up_channel_id from public.push_notification_devices where expo_push_token='ExpoPushToken[vibrationupgrade123456789]'),'wake-up-calls-v2','the upgraded channel survives a database read');
set local role authenticated;
select public.register_push_notification_device('ExpoPushToken[vibrationupgrade123456789]','android','en');
reset role;
select is((select wake_up_channel_id from public.push_notification_devices where expo_push_token='ExpoPushToken[vibrationupgrade123456789]'),'wake-up-calls-v1','an older client registration safely clears the capability');
set local role authenticated;
select public.register_push_notification_device('ExpoPushToken[vibrationupgrade123456789]','android','en','wake-up-calls-v2');
reset role;
select is((select wake_up_channel_id from public.push_notification_devices where expo_push_token='ExpoPushToken[vibrationupgrade123456789]'),'wake-up-calls-v2','a later upgraded registration restores the capability');
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok($$select public.register_push_notification_device('ExpoPushToken[vibrationinvalid123456789]','android','de','wake-up-calls-v2')$$,'42501','Authentication required.','a missing user identity cannot register a device');
reset role;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select set_config('test.planned',(public.admin_schedule_wake_up_call('Morgen',now()+interval '1 day')).id::text,true);
select set_config('test.cancelled',(public.admin_schedule_wake_up_call('Storniert',now()+interval '2 days')).id::text,true);
select is((select count(*) from public.wake_up_calls where id in (current_setting('test.planned')::bigint,current_setting('test.cancelled')::bigint)),2::bigint,'several calls can be planned');
select is((select count(*) from public.wake_up_call_recipients where call_id=current_setting('test.planned')::bigint),0::bigint,'planning does not activate recipients');
select throws_ok($$select public.admin_schedule_wake_up_call('Vergangen',now()-interval '1 minute')$$,'22023','Choose a future time within the next year.','past schedules are rejected');
select lives_ok($$select public.admin_schedule_wake_up_call('Geändert',now()+interval '3 days',current_setting('test.planned')::bigint)$$,'a pending call can be edited');
select public.admin_close_wake_up_call(current_setting('test.cancelled')::bigint);
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000002',true);
select is((select count(*) from public.wake_up_calls where id=current_setting('test.planned')::bigint),0::bigint,'planned calls are hidden from recipients');
select throws_ok($$select public.acknowledge_wake_up_call(current_setting('test.planned')::bigint)$$,'P0002','Active wake-up call not found.','a future call cannot be acknowledged');
select throws_ok($$select public.admin_schedule_wake_up_call('Forbidden',now()+interval '1 day')$$,'42501','Admin access required.','users cannot schedule calls');
select ok(not has_function_privilege('authenticated','public.claim_due_wake_up_notifications(bigint)','execute'),'only the server may activate and claim due calls');
reset role;
set local role service_role;
select is((select count(*) from public.claim_due_wake_up_notifications(current_setting('test.planned')::bigint)),0::bigint,'dispatch never sends early');
reset role;
insert into auth.users(id,email,raw_user_meta_data) values('82000000-0000-0000-0000-000000000003','schedule-late@example.invalid','{"display_name":"Registered Later"}');
update public.wake_up_calls set scheduled_for=now()-interval '1 second' where id in (current_setting('test.planned')::bigint,current_setting('test.cancelled')::bigint);
set local role service_role;
select is((select count(*) from public.claim_due_wake_up_notifications(current_setting('test.cancelled')::bigint)),0::bigint,'cancelled calls stay cancelled when their time arrives');
select set_config('test.claim_channels',(
  select jsonb_agg(jsonb_build_object('token',expo_push_token,'channel',wake_up_channel_id))::text
  from public.claim_due_wake_up_notifications(current_setting('test.planned')::bigint)
),true);
select cmp_ok(jsonb_array_length(current_setting('test.claim_channels')::jsonb)::bigint,'>',0::bigint,'a due call activates and claims registered devices');
select is((select item->>'channel' from jsonb_array_elements(current_setting('test.claim_channels')::jsonb) item where item->>'token'='ExpoPushToken[vibrationupgrade123456789]'),'wake-up-calls-v2','dispatch claims the upgraded channel only for a registered installation');
select is((select item->>'channel' from jsonb_array_elements(current_setting('test.claim_channels')::jsonb) item where item->>'token'='ExpoPushToken[vibrationlegacy123456789]'),'wake-up-calls-v1','dispatch keeps old Android installations on v1');
select is((select item->>'channel' from jsonb_array_elements(current_setting('test.claim_channels')::jsonb) item where item->>'token'='ExpoPushToken[scheduledcheck1234567890]'),'wake-up-calls-v1','dispatch keeps iOS on the existing channel');
select is((select count(*) from public.claim_due_wake_up_notifications(current_setting('test.planned')::bigint)),0::bigint,'repeated scheduler calls cannot duplicate push');
set local role authenticated;
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.wake_up_calls where id=current_setting('test.planned')::bigint),1::bigint,'accounts registered after planning receive the activated call');
select lives_ok($$select public.acknowledge_wake_up_call(current_setting('test.planned')::bigint)$$,'activated calls can be acknowledged');
select set_config('request.jwt.claim.sub','82000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.admin_schedule_wake_up_call('Zu spät',now()+interval '1 day',current_setting('test.planned')::bigint)$$,'P0002','Editable scheduled wake-up call not found.','activated calls cannot be rescheduled');
select lives_ok($$select public.admin_start_wake_up_call('Sofort')$$,'immediate calls still work alongside scheduled calls');
select * from finish();
rollback;
