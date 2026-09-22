begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table(
  'public',
  'daily_programs',
  'the journey-wide daily-program table exists'
);

select hasnt_column(
  'public',
  'daily_programs',
  'trip_id',
  'daily programs are not attached to intermediate trips'
);

select ok(
  not has_table_privilege('anon', 'public.daily_programs', 'select'),
  'anonymous users cannot read daily programs'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.admin_upsert_daily_programs(jsonb)',
    'execute'
  ),
  'anonymous users cannot publish daily programs'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '70000000-0000-0000-0000-000000000001',
    'daily-program-admin@example.invalid',
    '{"display_name":"Daily Program Admin"}'::jsonb
  ),
  (
    '70000000-0000-0000-0000-000000000002',
    'daily-program-user@example.invalid',
    '{"display_name":"Daily Program User"}'::jsonb
  );

update public.profiles
set role = 'admin'
where user_id = '70000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select throws_ok(
  $$
    select public.admin_upsert_daily_programs(
      jsonb_build_array(
        jsonb_build_object(
          'program_date', current_date,
          'title', 'Nicht erlaubt',
          'details', 'Darf nicht gespeichert werden'
        )
      )
    )
  $$,
  '42501',
  'Admin access required.',
  'a normal user cannot publish daily programs'
);

reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$
    select public.admin_upsert_daily_programs(
      jsonb_build_array(
        jsonb_build_object(
          'program_date', current_date,
          'title', 'Tag eins',
          'details', '08:00 Start'
        ),
        jsonb_build_object(
          'program_date', current_date + 1,
          'title', 'Tag zwei',
          'details', '09:00 Abfahrt'
        ),
        jsonb_build_object(
          'program_date', current_date + 2,
          'title', '',
          'details', '10:00 Treffpunkt'
        )
      )
    )
  $$,
  'an admin publishes the complete daily program without an intermediate trip'
);

select is(
  (select count(*) from public.daily_programs),
  3::bigint,
  'the batch creates one row per date'
);
select is(
  (
    select title
    from public.daily_programs
    where program_date = current_date + 2
  ),
  null::text,
  'an empty optional heading is normalized to null'
);

reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
set local role authenticated;

select is(
  (select count(*) from public.daily_programs),
  3::bigint,
  'every authenticated user can read the complete program without an intermediate-trip assignment'
);

reset role;
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
set local role authenticated;

select lives_ok(
  $$ select public.admin_create_trip('Hotel nach Karbala') $$,
  'an admin creates an intermediate trip independently'
);
select lives_ok(
  $$
    select public.admin_archive_trip(
      (select id from public.trips where name = 'Hotel nach Karbala')
    )
  $$,
  'an admin closes the intermediate trip independently'
);
select is(
  (select count(*) from public.daily_programs),
  3::bigint,
  'closing an intermediate trip does not hide or delete the daily program'
);

select lives_ok(
  $$
    select public.admin_upsert_daily_programs(
      jsonb_build_array(
        jsonb_build_object(
          'program_date', current_date + 1,
          'title', 'Tag zwei geändert',
          'details', '11:00 Neue Abfahrt'
        )
      )
    )
  $$,
  'an admin can update one already-published date without an active intermediate trip'
);
select is(
  (select count(*) from public.daily_programs),
  3::bigint,
  'updating a date does not create a duplicate'
);
select is(
  (
    select details
    from public.daily_programs
    where program_date = current_date + 1
  ),
  '11:00 Neue Abfahrt',
  'the edited program is stored for that date'
);

select * from finish();
rollback;
