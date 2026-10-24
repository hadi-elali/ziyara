begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id,email,raw_user_meta_data) values
  ('ea243000-0000-0000-0000-000000000001', 'birth-dates@example.com', '{"name":"Eltern","surname":"Familie","family_members":[{"name":" Kind ","surname":" Familie ","birth_date":"2020-02-29"},{"name":"Weiteres","surname":"Anderer Name","birth_date":"2015-03-24"}]}'),
  ('ea243000-0000-0000-0000-000000000002', 'old-client@example.com', '{"name":"Alt","surname":"Familie","family_members":[{"name":"Kind","surname":"Familie"}]}'),
  ('ea243000-0000-0000-0000-000000000003', 'today@example.com', jsonb_build_object('name','Heute','family_members',jsonb_build_array(jsonb_build_object('name','Kind','surname','Familie','birth_date',current_date::text))));

select is((select family_members from public.profiles where user_id = 'ea243000-0000-0000-0000-000000000001'), '[{"name":"Kind","surname":"Familie","birth_date":"2020-02-29"},{"name":"Weiteres","surname":"Anderer Name","birth_date":"2015-03-24"}]'::jsonb, 'Real signup stores calendar dates with the correct member');
select is((select party_size from public.profiles where user_id = 'ea243000-0000-0000-0000-000000000001'), 3::bigint, 'Dates preserve the count including the owner');
select is((select family_members from public.profiles where user_id = 'ea243000-0000-0000-0000-000000000002'), '[{"name":"Kind","surname":"Familie"}]'::jsonb, 'Older clients without birthdays remain supported without inventing dates');
select is((select family_members -> 0 ->> 'birth_date' from public.profiles where user_id = 'ea243000-0000-0000-0000-000000000003'), current_date::text, 'Today is a valid birth date');

select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":null}]}')$$,'23514',null,'Explicit null birthday rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":2020}]}')$$,'23514',null,'Non-string birthday rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":""}]}')$$,'23514',null,'Empty birthday rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":"29.02.2020"}]}')$$,'23514',null,'Non-ISO transport format rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":"2021-02-29"}]}')$$,'23514',null,'Non-leap-year February 29 rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":"1900-02-29"}]}')$$,'23514',null,'Non-leap century rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":"2020-04-31"}]}')$$,'23514',null,'Calendar rollover rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":"0000-01-01"}]}')$$,'23514',null,'Year zero rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Familie","birth_date":"2020-13-01"}]}')$$,'23514',null,'Invalid month rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea243000-0000-0000-0000-000000000004','bad-date@example.com',jsonb_build_object('name','Test','family_members',jsonb_build_array(jsonb_build_object('name','Kind','surname','Familie','birth_date',(current_date + 1)::text))))$$,'23514',null,'Future birthday rejected');
select is((select count(*) from auth.users where id = 'ea243000-0000-0000-0000-000000000004'),0::bigint,'Invalid dates roll back signup atomically');

set local role authenticated;
set local request.jwt.claim.sub = 'ea243000-0000-0000-0000-000000000001';
select is((select family_members -> 0 ->> 'birth_date' from public.profiles where user_id = auth.uid()),'2020-02-29'::text,'Owner can read the persisted birthday');
select is((select count(*) from public.profiles where user_id = 'ea243000-0000-0000-0000-000000000003'),0::bigint,'Other accounts cannot read birthdays');
select throws_ok($$update public.profiles set family_members = '[]'::jsonb where user_id = auth.uid()$$,'42501',null,'Clients cannot rewrite birthdays after registration');
reset role;

update auth.users set raw_user_meta_data = '{}'::jsonb where id = 'ea243000-0000-0000-0000-000000000001';
select is((select family_members -> 0 ->> 'birth_date' from public.profiles where user_id = 'ea243000-0000-0000-0000-000000000001'),'2020-02-29'::text,'Later metadata changes retain persisted birthdays');
delete from auth.users where id = 'ea243000-0000-0000-0000-000000000001';
select is((select count(*) from public.profiles where user_id = 'ea243000-0000-0000-0000-000000000001'),0::bigint,'Owner deletion removes birthdays');
select * from finish();
rollback;
