begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id,email,raw_user_meta_data) values
  ('ea244000-0000-0000-0000-000000000001','individual-dates@example.com',jsonb_build_object('name','Einzel','surname','Person','birth_date',(current_date - interval '32 years')::date::text,'age',32,'family_members','[]'::jsonb)),
  ('ea244000-0000-0000-0000-000000000002','family-dates@example.com',jsonb_build_object('name','Eltern','surname','Familie','birth_date',(current_date - interval '32 years')::date::text,'age',32,'family_members',jsonb_build_array(jsonb_build_object('name','Kind','surname','Familie','birth_date',(current_date - interval '8 years')::date::text,'age',8)))),
  ('ea244000-0000-0000-0000-000000000003','legacy-age@example.com','{"name":"Alt","age":32}'),
  ('ea244000-0000-0000-0000-000000000004','newborn@example.com',jsonb_build_object('name','Baby','birth_date',current_date::text,'age',0)),
  ('ea244000-0000-0000-0000-000000000005','derived-age@example.com',jsonb_build_object('name','Datum','birth_date',(current_date - interval '3 years')::date::text));

select is((select birth_date from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000001'),(current_date - interval '32 years')::date,'Individual signup stores owner birth date');
select is((select age::text from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000001'),'32'::text,'Individual signup stores matching age');
select is((select birth_date from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),(current_date - interval '32 years')::date,'Family signup stores owner birth date');
select is((select age::text from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),'32'::text,'Family signup stores matching owner age');
select is((select family_members -> 0 ->> 'birth_date' from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),(current_date - interval '8 years')::date::text,'Family member keeps own birth date');
select is((select family_members -> 0 ->> 'age' from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),'8'::text,'Family member keeps own age');
select is((select jsonb_typeof(family_members -> 0 -> 'age') from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),'number'::text,'Family age is a JSON number');
select is((select party_size from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),2::bigint,'Person count is still derived from the roster');
select ok((select birth_date is null from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000003'),'Legacy age-only client does not get an invented birth date');
select is((select age::text from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000003'),'32'::text,'Legacy age remains intact');
select is((select age::text from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000004'),'0'::text,'Today matches age zero');
select is((select age::text from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000005'),'3'::text,'Server derives a missing age when birth date is supplied');

select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","birth_date":null}')$$,'23514',null,'Owner JSON null birthday rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","birth_date":"2021-02-29"}')$$,'23514',null,'Owner invalid leap day rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","birth_date":"29.02.2020"}')$$,'23514',null,'Owner non-ISO transport date rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com',jsonb_build_object('name','Test','birth_date',(current_date+1)::text,'age',0))$$,'23514',null,'Owner future birth date rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com',jsonb_build_object('name','Test','birth_date',(current_date-interval '32 years')::date::text,'age',31))$$,'23514',null,'Owner inconsistent age rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com',jsonb_build_object('name','Test','birth_date',(current_date-interval '121 years')::date::text))$$,'23514',null,'Owner date exceeding age limit rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Name","age":null}]}')$$,'23514',null,'Family null age rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Name","age":"8"}]}')$$,'23514',null,'Family string age rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Name","age":-1}]}')$$,'23514',null,'Family negative age rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Name","age":1.5}]}')$$,'23514',null,'Family fractional age rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com','{"name":"Test","family_members":[{"name":"Kind","surname":"Name","age":121}]}')$$,'23514',null,'Family age above 120 rejected');
select throws_ok($$insert into auth.users(id,email,raw_user_meta_data) values ('ea244000-0000-0000-0000-000000000006','bad@example.com',jsonb_build_object('name','Test','family_members',jsonb_build_array(jsonb_build_object('name','Kind','surname','Name','birth_date',(current_date-interval '8 years')::date::text,'age',7))))$$,'23514',null,'Family inconsistent age rejected');
select is((select count(*) from auth.users where id = 'ea244000-0000-0000-0000-000000000006'),0::bigint,'Rejected registration is atomic');

set local role authenticated;
set local request.jwt.claim.sub = 'ea244000-0000-0000-0000-000000000002';
select is((select birth_date from public.profiles where user_id = auth.uid()),(current_date-interval '32 years')::date,'Owner can read the saved date after signup');
select is((select count(*) from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000001'),0::bigint,'Other owners cannot read date and age');
select throws_ok($$update public.profiles set birth_date = current_date where user_id = auth.uid()$$,'42501',null,'No new client permission to change registration date');
select ok(not has_function_privilege('authenticated','public.parse_registration_birth_date(jsonb)','execute'),'Date parser is private');
reset role;

update auth.users set raw_user_meta_data = '{}'::jsonb where id = 'ea244000-0000-0000-0000-000000000002';
select is((select birth_date from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),(current_date-interval '32 years')::date,'Later metadata changes preserve owner birth date');
select is((select family_members -> 0 ->> 'age' from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),'8'::text,'Later metadata changes preserve member age');
delete from auth.users where id = 'ea244000-0000-0000-0000-000000000002';
select is((select count(*) from public.profiles where user_id = 'ea244000-0000-0000-0000-000000000002'),0::bigint,'Owner deletion removes dates and family ages');
select * from finish();
rollback;
