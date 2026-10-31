begin;
create extension if not exists pgtap with schema extensions;
select plan(49);
-- Rollback-only synthetic fixtures; no real push is sent.
delete from public.daily_programs;
delete from public.push_notification_devices;
insert into auth.users(id,email,raw_user_meta_data) values
 ('73000000-0000-0000-0000-000000000001','item-admin@example.invalid','{"display_name":"Item Admin"}'),
 ('73000000-0000-0000-0000-000000000002','item-user@example.invalid','{"display_name":"Item User"}');
update public.profiles set role='admin' where user_id='73000000-0000-0000-0000-000000000001';
select ok(not has_table_privilege('anon','public.daily_program_items','select'), 'anonymous users cannot read agenda items');
select ok(not has_table_privilege('authenticated','public.daily_program_items','update'), 'clients cannot directly change agenda items');
select ok(not has_function_privilege('authenticated','public.claim_due_daily_program_notifications()','execute'), 'clients cannot claim tokens');
select ok(not has_function_privilege('authenticated','public.admin_schedule_daily_program_push(bigint,timestamptz)','execute'), 'day-wide push planning is retired');
select ok(not has_function_privilege('anon','public.admin_schedule_daily_program_item_push(bigint,timestamptz,boolean)','execute'), 'anonymous users cannot plan pushes');
select ok(not has_table_privilege('authenticated','public.daily_program_push_attempts','select'), 'attempts remain private');
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000002',true);
set local role authenticated;
select throws_ok($$ select public.admin_schedule_daily_program_item_push(0, now()+interval '1 day') $$,
 '42501','Admin access required.','ordinary users cannot schedule item pushes');
reset role;
select set_config('request.jwt.claim.sub','73000000-0000-0000-0000-000000000001',true);
set local role authenticated;
select lives_ok($$ select public.admin_upsert_daily_programs(jsonb_build_array(jsonb_build_object(
 'program_date',current_date,'details',E'08:00 Frühstück\n\n09:00 Abfahrt\n09:00 Abfahrt\n10:00 Treffen',
 'push_scheduled_at',now()+interval '1 day'
))) $$,'publishing creates agenda items without a push');
select is((select count(*) from public.daily_program_items),4::bigint,'blank lines are ignored and duplicate entries remain distinct');
reset role;
select is((select count(*) from public.daily_program_push_jobs),0::bigint,'publishing never creates a push job even with a legacy push field');
create temporary table original_items as select * from public.daily_program_items;
set local role authenticated;
select throws_ok($$ select public.admin_schedule_daily_program_item_push(0,now()+interval '1 day') $$,
 'P0002','Daily program item not found.','only published items can be scheduled');
select lives_ok($$ select public.admin_schedule_daily_program_item_push(
 (select id from public.daily_program_items where position=1), '2099-07-10T06:00:00+02:00'
) $$,'the first duplicate entry receives a schedule');
select lives_ok($$ select public.admin_schedule_daily_program_item_push(
 (select id from public.daily_program_items where position=2), now()+interval '2 days'
) $$,'the second duplicate entry receives an independent schedule');
select is((select push_scheduled_at from public.daily_program_items where position=1),
 '2099-07-10T04:00:00Z'::timestamptz,'local admin offset resolves to UTC');
select ok((select push_scheduled_at is null from public.daily_program_items where position=0),'other agenda items stay silent');
select is((select details from public.daily_programs),E'08:00 Frühstück\n\n09:00 Abfahrt\n09:00 Abfahrt\n10:00 Treffen','planning does not change the program text');
select throws_ok($$ select public.admin_schedule_daily_program_item_push(
 (select id from public.daily_program_items where position=0),now()-interval '1 minute'
) $$,'22023','Choose a future push time.','past times are rejected');
select throws_ok($$ select public.admin_schedule_daily_program_item_push(
 (select id from public.daily_program_items where position=0),'infinity'
) $$,'22023','Choose a future push time.','non-finite times are rejected');
reset role;
select is((select count(*) from public.claim_due_daily_program_notifications()),0::bigint,'future item pushes do not send early');
set local role authenticated;
select lives_ok($$ select public.admin_upsert_daily_programs(jsonb_build_array(jsonb_build_object(
 'program_date',current_date,'details',E'Neuer Punkt\n10:00 Treffen\n09:00 Abfahrt\n09:00 Abfahrt\n08:00 Frühstück'
))) $$,'reordering and insertion preserve existing item identities');
reset role;
select is((select id from public.daily_program_items where position=2),(select id from original_items where position=1),'the first duplicate retains its original ID');
select is((select id from public.daily_program_items where position=3),(select id from original_items where position=2),'the second duplicate retains its own ID');
select is((select push_scheduled_at from public.daily_program_items where position=2),
 '2099-07-10T04:00:00Z'::timestamptz,'reordering preserves the correct schedule');
select is((select count(*) from public.daily_program_push_jobs where cancelled_at is null),2::bigint,'reordering does not duplicate jobs');
set local role authenticated;
select lives_ok($$ select public.admin_schedule_daily_program_item_push(
 (select id from public.daily_program_items where position=2),'2099-07-10T04:00:00Z'
) $$,'saving the same item schedule is idempotent');
reset role;
select is((select count(*) from public.daily_program_push_jobs),2::bigint,'unchanged saves create no additional job');
set local role authenticated;
select lives_ok($$ select public.admin_schedule_daily_program_item_push(
 (select id from public.daily_program_items where position=2),now()+interval '1 day'
) $$,'an individual item can be rescheduled');
reset role;
select is((select count(*) from public.daily_program_push_jobs where cancelled_at is null),2::bigint,'rescheduling replaces only that item job');
select is((select push_scheduled_at from public.daily_program_items where position=3),now()+interval '2 days','rescheduling preserves the other duplicate schedule');
insert into public.push_notification_devices(profile_id,expo_push_token,platform,locale)
 select p.id,'ExponentPushToken[agenda-item-'||n||']','ios',case when n=1 then 'en' when n=2 then 'ar' else 'de' end
 from public.profiles p cross join generate_series(1,102) n where p.user_id='73000000-0000-0000-0000-000000000002';
update public.daily_program_push_jobs set scheduled_at=now()-interval '1 minute' where cancelled_at is null;
create temporary table first_claim as select * from public.claim_due_daily_program_notifications();
select is((select count(*) from first_claim),100::bigint,'a claim contains at most 100 devices for one item');
select is((select count(distinct item_id) from first_claim),1::bigint,'one batch belongs to exactly one agenda item');
select ok((select bool_and(body='09:00 Abfahrt') from first_claim),'push body contains only the selected agenda line');
select ok(exists(select 1 from first_claim where title like 'Daily program%'),'English title is localized');
select ok(exists(select 1 from first_claim where title like 'البرنامج اليومي%'),'Arabic title is localized');
select ok((select push_started_at is not null from public.daily_program_items where id=(select item_id from first_claim limit 1)),'only the claimed item records activation');
update public.push_notification_devices set profile_id=(select id from public.profiles where user_id='73000000-0000-0000-0000-000000000001')
 where expo_push_token='ExponentPushToken[agenda-item-102]';
select is((select count(*) from public.claim_due_daily_program_notifications()),1::bigint,'reassigned devices are excluded from remaining claims');
create temporary table second_claim as select * from public.claim_due_daily_program_notifications();
select is((select count(*) from second_claim),100::bigint,'the second duplicate has a separate full batch');
select set_config('test.second_item_id',(select item_id from second_claim limit 1)::text,true);
set local role authenticated;
select lives_ok($$ select public.admin_schedule_daily_program_item_push(
 current_setting('test.second_item_id')::bigint,null
) $$,'an admin can stop one item while its batch is partially claimed');
reset role;
select is((select count(*) from public.claim_due_daily_program_notifications()),0::bigint,'cancelled items do not claim remaining devices and completed items do not repeat');
set local role authenticated;
select lives_ok($$ select public.admin_upsert_daily_programs(jsonb_build_array(jsonb_build_object(
 'program_date',current_date,'details',E'Neuer Punkt\n10:00 Treffen\n09:00 Abfahrt geändert\n08:00 Frühstück'
))) $$,'changing or removing a line removes its old schedule');
reset role;
select is((select count(*) from public.daily_program_push_jobs where cancelled_at is null),0::bigint,'removed item jobs are cancelled');
select ok((select push_scheduled_at is null from public.daily_program_items where details='09:00 Abfahrt geändert'),'a rewritten line starts without a schedule');
select is((select count(*) from public.daily_program_items where details='09:00 Abfahrt'),0::bigint,'neither removed duplicate is silently reassigned to another line');
set local role authenticated;
select lives_ok($$ select public.admin_schedule_daily_program_item_push(
 (select id from public.daily_program_items where position=0),null,true
) $$,'the current-minute preset uses the server instant without clock skew');
select is((select push_scheduled_at from public.daily_program_items where position=0),now(),'send-now is stored as the exact current server time');
reset role;
select is((select count(*) from public.claim_due_daily_program_notifications()),100::bigint,'current-minute notifications are immediately due');
select is((select count(*) from public.claim_due_daily_program_notifications()),2::bigint,'current-minute batches drain without mixing items');
select is((select count(*) from public.claim_due_daily_program_notifications()),0::bigint,'repeated scheduler runs never send the same item again');
select is((select count(*) from public.daily_program_items),4::bigint,'editing leaves one persistent record per visible subpoint');
set constraints all immediate;
select * from finish();
rollback;
