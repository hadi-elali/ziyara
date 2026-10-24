begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
  ('ea240000-0000-0000-0000-000000000001', 'legacy-family@example.com', '{"name":"Alt","surname":"Familie","party_size":4}'),
  ('ea240000-0000-0000-0000-000000000002', 'new-family@example.com', '{"name":"Eltern","surname":"Familie","age":32,"role":"admin","member_type":"sister","party_size":49,"luggage_count":2,"sim_card_count":1,"family_members":[{"name":" Kind ","surname":" Familie "},{"name":"ع","surname":"Anderer Name","role":"admin"}]}'),
  ('ea240000-0000-0000-0000-000000000003', 'single@example.com', '{"name":"Einzel","surname":"Person","party_size":4,"family_members":[]}');

select is((select party_size from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000001'), 4::bigint, 'Older clients retain their party size');
select is((select family_members from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000001'), '[]'::jsonb, 'Older clients get no invented names');
select is((select party_size from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), 3::bigint, 'Signup derives count from names including the owner');
select is((select family_members from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), '[{"name":"Kind","surname":"Familie"},{"name":"ع","surname":"Anderer Name"}]'::jsonb, 'Names are trimmed, distinct surnames retained, extra keys excluded');
select is((select role::text from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), 'user'::text, 'Signup metadata cannot elevate roles');
select is((select age::text from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), '32'::text, 'Existing age capture remains intact');
select is((select luggage_count from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), 2::bigint, 'Luggage is preserved');
select is((select sim_card_count from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), 1::bigint, 'SIM count is preserved');
select is((select member_type::text from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), 'sister'::text, 'Member type is preserved');
select is((select party_size from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000003'), 1::bigint, 'An explicit empty list represents only the owner');

select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com','{"name":"Test","family_members":null}')$$, '23514', null, 'JSON null rejected');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com','{"name":"Test","family_members":{}}')$$, '23514', null, 'Non-array rejected');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com','{"name":"Test","family_members":[null]}')$$, '23514', null, 'Null member rejected');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com','{"name":"Test","family_members":[{"name":17,"surname":"Name"}]}')$$, '23514', null, 'Non-string name rejected');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com','{"name":"Test","family_members":[{"name":"Kind"}]}')$$, '23514', null, 'Missing surname rejected');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com','{"name":"Test","family_members":[{"name":" ","surname":"Name"}]}')$$, '23514', null, 'Blank name rejected');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com',jsonb_build_object('name','Test','family_members',jsonb_build_array(jsonb_build_object('name','Kind','surname',repeat('A',81)))))$$, '23514', null, 'Oversized surname rejected');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000004','bad@example.com',jsonb_build_object('name','Test','family_members',(select jsonb_agg(jsonb_build_object('name','Kind','surname','Name')) from generate_series(1,50))))$$, '23514', null, 'More than 49 additional members rejected');
select is((select count(*) from auth.users where id = 'ea240000-0000-0000-0000-000000000004'), 0::bigint, 'Invalid signup is rolled back atomically');

insert into auth.users (id,email,raw_user_meta_data) values ('ea240000-0000-0000-0000-000000000005','max@example.com',jsonb_build_object('name','Test','family_members',(select jsonb_agg(jsonb_build_object('name',repeat('A',80),'surname',repeat('B',80))) from generate_series(1,49))));
select is((select party_size from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000005'), 50::bigint, 'Exactly 50 people with boundary length names accepted');

set local role authenticated;
set local request.jwt.claim.sub = 'ea240000-0000-0000-0000-000000000002';
select is((select jsonb_array_length(family_members) from public.profiles where user_id = auth.uid()), 2, 'Owner can read the persisted roster');
select is((select count(*) from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000001'), 0::bigint, 'Another family profile is private');
select throws_ok($$update public.profiles set family_members = '[]'::jsonb where user_id = auth.uid()$$, '42501', null, 'Clients cannot overwrite the registration snapshot');
update public.profiles set party_size = 4 where user_id = auth.uid();
select is((select jsonb_array_length(family_members) from public.profiles where user_id = auth.uid()), 2, 'Later party-size edits preserve registration snapshot');
reset role;

update auth.users set raw_user_meta_data = '{"family_members":[]}' where id = 'ea240000-0000-0000-0000-000000000002';
select is((select jsonb_array_length(family_members) from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), 2, 'Later auth metadata updates cannot overwrite the snapshot');
select ok(not has_function_privilege('authenticated', 'public.capture_registration_family_members()', 'execute'), 'Trigger function has no direct client access');
select ok(not has_table_privilege('anon', 'public.profiles', 'select'), 'Anonymous users cannot read family names');

delete from auth.users where id = 'ea240000-0000-0000-0000-000000000002';
select is((select count(*) from public.profiles where user_id = 'ea240000-0000-0000-0000-000000000002'), 0::bigint, 'Deleting the owner also deletes the saved names');
select * from finish();
rollback;
