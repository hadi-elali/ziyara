create extension if not exists pgtap with schema extensions;

create temporary table phase5_extension_state (dblink_was_installed boolean not null);
insert into phase5_extension_state
select exists (select 1 from pg_extension where extname = 'dblink');

create extension if not exists dblink with schema extensions;

drop schema if exists phase5_test cascade;
create schema phase5_test;

create function phase5_test.demote_as(
  p_caller_user_id uuid,
  p_target_user_id uuid,
  p_hold_seconds double precision
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_caller_user_id::text, true);
  perform public.admin_set_user_role(p_target_user_id, 'user'::public.app_role);
  perform pg_catalog.pg_sleep(p_hold_seconds);
  return 'ok';
exception
  when others then
    return sqlstate;
end;
$$;

create function phase5_test.submit_question_as(
  p_user_id uuid,
  p_round_id int8,
  p_question text,
  p_delay_seconds double precision
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform pg_catalog.pg_sleep(p_delay_seconds);
  perform public.submit_anonymous_question(p_round_id, p_question);
  return 'ok';
exception
  when others then
    return sqlstate;
end;
$$;

create function phase5_test.respond_as(
  p_user_id uuid,
  p_check_id int8,
  p_hold_seconds double precision
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform public.respond_to_group_check(p_check_id, true);
  perform pg_catalog.pg_sleep(p_hold_seconds);
  return 'ok';
exception
  when others then
    return sqlstate;
end;
$$;

create function phase5_test.close_group_check_as(
  p_user_id uuid,
  p_check_id int8,
  p_hold_seconds double precision
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform public.close_group_check(p_check_id);
  perform pg_catalog.pg_sleep(p_hold_seconds);
  return 'ok';
exception
  when others then
    return sqlstate;
end;
$$;

delete from public.group_checks
where id in (960000000000000001, 960000000000000002);
delete from public.question_rounds
where id = 960000000000000001;
delete from public.role_assignment_audit
where target_user_id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);
-- Phase 6 protects the final administrator at auth.users. Reset any fixtures
-- left by an interrupted earlier test run before deleting the synthetic users.
update public.profiles
set role = 'user'
where user_id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);
delete from auth.users
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);

insert into auth.users (id, email, raw_user_meta_data)
values
  (
    '20000000-0000-0000-0000-000000000001',
    'phase5-concurrent-admin-a@example.invalid',
    '{"display_name":"Phase 5 Concurrent Admin A"}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'phase5-concurrent-admin-b@example.invalid',
    '{"display_name":"Phase 5 Concurrent Admin B"}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'phase5-concurrent-questions@example.invalid',
    '{"display_name":"Phase 5 Concurrent Questions","member_type":"brother"}'::jsonb
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    'phase5-concurrent-group@example.invalid',
    '{"display_name":"Phase 5 Concurrent Group"}'::jsonb
  );

update public.profiles
set role = 'admin'
where user_id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

insert into public.question_rounds (id, target_member_type)
overriding system value
values (960000000000000001, 'brother');

select plan(15);

create temporary table phase5_admin_results (
  connection_name text primary key,
  status text not null
);

do $$
begin
  perform extensions.dblink_connect(
    'phase5_admin_a',
    'host=supabase_db_ziyara port=5432 dbname=postgres user=postgres password=postgres'
  );
  perform extensions.dblink_connect(
    'phase5_admin_b',
    'host=supabase_db_ziyara port=5432 dbname=postgres user=postgres password=postgres'
  );

  perform extensions.dblink_send_query(
    'phase5_admin_a',
    $query$
      select phase5_test.demote_as(
        '20000000-0000-0000-0000-000000000001'::uuid,
        '20000000-0000-0000-0000-000000000002'::uuid,
        0.5
      )
    $query$
  );
  perform pg_catalog.pg_sleep(0.1);
  perform extensions.dblink_send_query(
    'phase5_admin_b',
    $query$
      select phase5_test.demote_as(
        '20000000-0000-0000-0000-000000000002'::uuid,
        '20000000-0000-0000-0000-000000000001'::uuid,
        0
      )
    $query$
  );
end;
$$;

insert into phase5_admin_results (connection_name, status)
select 'phase5_admin_a', response.status
from extensions.dblink_get_result('phase5_admin_a') as response(status text);
insert into phase5_admin_results (connection_name, status)
select 'phase5_admin_b', response.status
from extensions.dblink_get_result('phase5_admin_b') as response(status text);

select is(
  (select status from phase5_admin_results where connection_name = 'phase5_admin_a'),
  'ok',
  'the first concurrent admin demotion commits'
);
select is(
  (select status from phase5_admin_results where connection_name = 'phase5_admin_b'),
  '42501',
  'the demoted concurrent caller cannot demote the remaining admin'
);
select is(
  (
    select count(*)
    from public.profiles
    where user_id in (
      '20000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000002'
    )
      and role = 'admin'
  ),
  1::bigint,
  'parallel role changes leave exactly one administrator'
);

create temporary table phase5_question_results (
  connection_name text primary key,
  status text not null
);

do $$
declare
  connection_index int4;
  connection_name text;
begin
  for connection_index in 1..6 loop
    connection_name := format('phase5_question_%s', connection_index);
    perform extensions.dblink_connect(
      connection_name,
      'host=supabase_db_ziyara port=5432 dbname=postgres user=postgres password=postgres'
    );
    perform extensions.dblink_send_query(
      connection_name,
      format(
        $query$
          select phase5_test.submit_question_as(
            '20000000-0000-0000-0000-000000000003'::uuid,
            960000000000000001,
            %L,
            0.25
          )
        $query$,
        format('Phase 5 parallele Frage %s?', connection_index)
      )
    );
  end loop;
end;
$$;

insert into phase5_question_results (connection_name, status)
select 'phase5_question_1', response.status
from extensions.dblink_get_result('phase5_question_1') as response(status text);
insert into phase5_question_results (connection_name, status)
select 'phase5_question_2', response.status
from extensions.dblink_get_result('phase5_question_2') as response(status text);
insert into phase5_question_results (connection_name, status)
select 'phase5_question_3', response.status
from extensions.dblink_get_result('phase5_question_3') as response(status text);
insert into phase5_question_results (connection_name, status)
select 'phase5_question_4', response.status
from extensions.dblink_get_result('phase5_question_4') as response(status text);
insert into phase5_question_results (connection_name, status)
select 'phase5_question_5', response.status
from extensions.dblink_get_result('phase5_question_5') as response(status text);
insert into phase5_question_results (connection_name, status)
select 'phase5_question_6', response.status
from extensions.dblink_get_result('phase5_question_6') as response(status text);

select is(
  (select count(*) from phase5_question_results where status = 'ok'),
  5::bigint,
  'five of six concurrent question submissions commit'
);
select is(
  (select count(*) from phase5_question_results where status = 'P0001'),
  1::bigint,
  'one concurrent question submission is rejected at the limit'
);
select is(
  (
    select count(*)
    from public.anonymous_questions
    where round_id = 960000000000000001
  ),
  5::bigint,
  'concurrent submissions cannot store more than five questions'
);
select is(
  (
    select submission_count
    from public.question_submission_limits
    where round_id = 960000000000000001
  ),
  5,
  'the concurrent limit counter remains exactly five'
);

insert into public.group_checks (id, question, created_by_profile_id)
overriding system value
select
  960000000000000001,
  'Phase 5 response-first race?',
  profiles.id
from public.profiles as profiles
where profiles.user_id = '20000000-0000-0000-0000-000000000001';

create temporary table phase5_group_response_first_results (
  connection_name text primary key,
  status text not null
);

do $$
begin
  perform extensions.dblink_connect(
    'phase5_group_respond_first',
    'host=supabase_db_ziyara port=5432 dbname=postgres user=postgres password=postgres'
  );
  perform extensions.dblink_connect(
    'phase5_group_close_second',
    'host=supabase_db_ziyara port=5432 dbname=postgres user=postgres password=postgres'
  );

  perform extensions.dblink_send_query(
    'phase5_group_respond_first',
    $query$
      select phase5_test.respond_as(
        '20000000-0000-0000-0000-000000000004'::uuid,
        960000000000000001,
        0.5
      )
    $query$
  );
  perform pg_catalog.pg_sleep(0.1);
  perform extensions.dblink_send_query(
    'phase5_group_close_second',
    $query$
      select phase5_test.close_group_check_as(
        '20000000-0000-0000-0000-000000000001'::uuid,
        960000000000000001,
        0
      )
    $query$
  );
end;
$$;

insert into phase5_group_response_first_results (connection_name, status)
select 'respond', response.status
from extensions.dblink_get_result('phase5_group_respond_first') as response(status text);
insert into phase5_group_response_first_results (connection_name, status)
select 'close', response.status
from extensions.dblink_get_result('phase5_group_close_second') as response(status text);

select is(
  (select status from phase5_group_response_first_results where connection_name = 'respond'),
  'ok',
  'a response that acquires the lock first commits'
);
select is(
  (select status from phase5_group_response_first_results where connection_name = 'close'),
  'ok',
  'closing waits for and then follows the committed response'
);
select is(
  (
    select count(*)
    from public.group_check_responses
    where check_id = 960000000000000001
  ),
  1::bigint,
  'the response-first order keeps the committed answer'
);
select ok(
  (
    select closed_at is not null
    from public.group_checks
    where id = 960000000000000001
  ),
  'the response-first check is closed after the answer commits'
);

insert into public.group_checks (id, question, created_by_profile_id)
overriding system value
select
  960000000000000002,
  'Phase 5 close-first race?',
  profiles.id
from public.profiles as profiles
where profiles.user_id = '20000000-0000-0000-0000-000000000001';

create temporary table phase5_group_close_first_results (
  connection_name text primary key,
  status text not null
);

do $$
begin
  perform extensions.dblink_connect(
    'phase5_group_close_first',
    'host=supabase_db_ziyara port=5432 dbname=postgres user=postgres password=postgres'
  );
  perform extensions.dblink_connect(
    'phase5_group_respond_second',
    'host=supabase_db_ziyara port=5432 dbname=postgres user=postgres password=postgres'
  );

  perform extensions.dblink_send_query(
    'phase5_group_close_first',
    $query$
      select phase5_test.close_group_check_as(
        '20000000-0000-0000-0000-000000000001'::uuid,
        960000000000000002,
        0.5
      )
    $query$
  );
  perform pg_catalog.pg_sleep(0.1);
  perform extensions.dblink_send_query(
    'phase5_group_respond_second',
    $query$
      select phase5_test.respond_as(
        '20000000-0000-0000-0000-000000000004'::uuid,
        960000000000000002,
        0
      )
    $query$
  );
end;
$$;

insert into phase5_group_close_first_results (connection_name, status)
select 'close', response.status
from extensions.dblink_get_result('phase5_group_close_first') as response(status text);
insert into phase5_group_close_first_results (connection_name, status)
select 'respond', response.status
from extensions.dblink_get_result('phase5_group_respond_second') as response(status text);

select is(
  (select status from phase5_group_close_first_results where connection_name = 'close'),
  'ok',
  'a close that acquires the lock first commits'
);
select is(
  (select status from phase5_group_close_first_results where connection_name = 'respond'),
  'P0002',
  'a response waiting behind a close observes the closed check and fails'
);
select is(
  (
    select count(*)
    from public.group_check_responses
    where check_id = 960000000000000002
  ),
  0::bigint,
  'the close-first order stores no late answer'
);
select ok(
  (
    select closed_at is not null
    from public.group_checks
    where id = 960000000000000002
  ),
  'the close-first check remains closed'
);

select * from finish();

do $$
declare
  connection_name text;
begin
  foreach connection_name in array array[
    'phase5_admin_a',
    'phase5_admin_b',
    'phase5_question_1',
    'phase5_question_2',
    'phase5_question_3',
    'phase5_question_4',
    'phase5_question_5',
    'phase5_question_6',
    'phase5_group_respond_first',
    'phase5_group_close_second',
    'phase5_group_close_first',
    'phase5_group_respond_second'
  ] loop
    perform extensions.dblink_disconnect(connection_name);
  end loop;
end;
$$;

delete from public.group_checks
where id in (960000000000000001, 960000000000000002);
delete from public.question_rounds
where id = 960000000000000001;
delete from public.role_assignment_audit
where target_user_id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);
update public.profiles
set role = 'user'
where user_id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);
delete from auth.users
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000004'
);

drop schema phase5_test cascade;

do $$
begin
  if not (select dblink_was_installed from phase5_extension_state) then
    drop extension dblink;
  end if;
end;
$$;
