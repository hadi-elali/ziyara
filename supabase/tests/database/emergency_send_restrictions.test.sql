begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(not has_table_privilege('authenticated', 'public.emergency_send_restrictions', 'select'), 'moderation history is not client readable');
select ok(not has_table_privilege('authenticated', 'public.emergency_send_restrictions', 'insert,update,delete'), 'direct restriction writes denied');
select ok(not has_table_privilege('authenticated', 'public.emergency_requests', 'insert'), 'direct emergency inserts denied');
select ok(not has_function_privilege('anon', 'public.get_my_emergency_send_restriction()', 'execute'), 'anonymous status read denied');
select ok(not has_function_privilege('anon', 'public.admin_restrict_emergency_sender(integer,text,uuid,bigint)', 'execute'), 'anonymous restriction denied');
select ok(not has_function_privilege('authenticated', 'public.resolve_emergency_restriction_profile(uuid,bigint)', 'execute'), 'target helper private');
select ok(not has_function_privilege('authenticated', 'public.enforce_emergency_send_restriction()', 'execute'), 'insert guard private');

insert into auth.users(id, email, raw_user_meta_data) values
  ('90000000-0000-0000-0000-000000000001', 'restriction-admin@example.invalid', '{"display_name":"Restriction Admin"}'),
  ('90000000-0000-0000-0000-000000000002', 'restriction-sender@example.invalid', '{"display_name":"Restriction Sender"}'),
  ('90000000-0000-0000-0000-000000000003', 'restriction-medical@example.invalid', '{"display_name":"Restriction Medical"}'),
  ('90000000-0000-0000-0000-000000000004', 'restriction-travel@example.invalid', '{"display_name":"Restriction Travel"}'),
  ('90000000-0000-0000-0000-000000000005', 'restriction-scholar@example.invalid', '{"display_name":"Restriction Scholar"}'),
  ('90000000-0000-0000-0000-000000000006', 'restriction-other@example.invalid', '{"display_name":"Restriction Other"}');
update public.profiles set role = case right(user_id::text, 1)
  when '1' then 'admin'::public.app_role when '3' then 'medical_staff'::public.app_role
  when '4' then 'organization_team'::public.app_role when '5' then 'scholar'::public.app_role else 'user'::public.app_role end
where user_id::text like '90000000-%';

create temporary table restriction_fixture(name text primary key, id bigint);
grant all on restriction_fixture to authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
set local role authenticated;
insert into restriction_fixture select 'request', request_id from public.submit_emergency_request('medical', 'Original emergency', 'Hotel lobby');
select is(public.get_my_emergency_send_restriction(), null::timestamptz, 'new accounts have no restriction');
select throws_ok($$select public.admin_restrict_emergency_sender(null, 'Manual release misuse', '90000000-0000-0000-0000-000000000006')$$, '42501', 'Admin access required.', 'manual release restriction still requires admin');
reset role;

-- Every non-admin role is rejected, including emergency teams and scholars.
select set_config('request.jwt.claim.sub', user_id::text, true),
  throws_ok($$select public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')$$, '42501', 'Admin access required.', 'non-admin cannot inspect moderation'),
  throws_ok($$select public.admin_restrict_emergency_sender(1, 'Repeated misuse', '90000000-0000-0000-0000-000000000002')$$, '42501', 'Admin access required.', 'non-admin cannot restrict'),
  throws_ok($$select public.admin_revoke_emergency_send_restriction(1, '90000000-0000-0000-0000-000000000002')$$, '42501', 'Admin access required.', 'non-admin cannot revoke')
from public.profiles where user_id::text like '90000000-%' and role <> 'admin';

select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select throws_ok($$select public.get_my_emergency_send_restriction()$$, '42501', 'Authentication required.', 'own read requires identity');
select throws_ok($$select public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')$$, '42501', 'Admin access required.', 'admin read requires identity');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select throws_ok($$select public.admin_restrict_emergency_sender(0, 'Repeated misuse', '90000000-0000-0000-0000-000000000002')$$, '22023', 'Choose 1 hour, 24 hours or manual release.', 'zero duration rejected');
select throws_ok($$select public.admin_restrict_emergency_sender(null, '  ', '90000000-0000-0000-0000-000000000002')$$, '22023', 'A restriction reason of 5 to 500 characters is required.', 'manual release restriction requires reason');
select throws_ok($$select public.admin_restrict_emergency_sender(48, 'Repeated misuse', '90000000-0000-0000-0000-000000000002')$$, '22023', 'Choose 1 hour, 24 hours or manual release.', 'unsupported duration rejected');
select throws_ok($$select public.admin_restrict_emergency_sender(1, '    ', '90000000-0000-0000-0000-000000000002')$$, '22023', 'A restriction reason of 5 to 500 characters is required.', 'reason required');
select throws_ok($$select public.admin_restrict_emergency_sender(1, repeat('x', 501), '90000000-0000-0000-0000-000000000002')$$, '22023', 'A restriction reason of 5 to 500 characters is required.', 'long reason rejected');
select throws_ok($$select public.admin_get_emergency_send_restriction()$$, '22023', 'Exactly one emergency restriction target is required.', 'target required');
select throws_ok($$select public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002', 1)$$, '22023', 'Exactly one emergency restriction target is required.', 'ambiguous target rejected');
select throws_ok($$select public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000099')$$, 'P0002', 'Emergency restriction target not found.', 'missing account rejected');
insert into restriction_fixture select 'first', id from public.admin_restrict_emergency_sender(
  1, '  Repeated misuse  ', p_request_id => (select id from restriction_fixture where name = 'request'));
select is((select reason from public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')), 'Repeated misuse', 'reason normalized and admin-readable');
select is((select created_by_display_name from public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')), 'Restriction Admin', 'responsible admin recorded');
select ok((select restricted_until between clock_timestamp() + interval '59 minutes' and clock_timestamp() + interval '61 minutes'
  from public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')), 'one hour measured by server');
select throws_ok($$select public.admin_restrict_emergency_sender(24, 'Other admin reason', '90000000-0000-0000-0000-000000000002')$$, '55000', 'An active emergency send restriction already exists.', 'concurrent admin cannot overwrite active restriction');
select throws_ok($$select public.admin_revoke_emergency_send_restriction(-1, '90000000-0000-0000-0000-000000000002')$$, '40001', 'Emergency send restriction has changed. Refresh and try again.', 'wrong restriction id cannot revoke');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select ok(public.get_my_emergency_send_restriction() > clock_timestamp(), 'sender can read own expiry');
select throws_ok($$select public.submit_emergency_request('medical', 'Medical blocked attempt', 'Lobby')$$, 'P0001', 'EMERGENCY_SEND_RESTRICTED', 'medical sending blocked through legacy RPC');
select throws_ok($$select public.submit_emergency_request('travel', 'Travel blocked attempt', 'Lobby')$$, 'P0001', 'EMERGENCY_SEND_RESTRICTED', 'travel sending blocked through legacy RPC');
select is((select count(*)::int from public.emergency_requests where requester_display_name = 'Restriction Sender'), 1, 'blocked attempts create no emergency');
select is((select count(*)::int from public.emergency_requests where id = (select id from restriction_fixture where name = 'request')), 1, 'existing sent emergency remains readable');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000006', true);
select is(public.get_my_emergency_send_restriction(), null::timestamptz, 'other account cannot see expiry');
select lives_ok($$select public.submit_emergency_request('travel', 'Unrelated account help', 'Bus')$$, 'other account can still send');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.admin_revoke_emergency_send_restriction((select id from restriction_fixture where name = 'first'), '90000000-0000-0000-0000-000000000002')$$, 'admin lifts restriction');
reset role;
select ok((select revoked_at is not null and revoked_by_profile_id is not null and revoked_by_display_name = 'Restriction Admin'
  from public.emergency_send_restrictions where id = (select id from restriction_fixture where name = 'first')), 'revocation actor and time retained');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select lives_ok($$select public.submit_emergency_request('medical', 'Help after revocation', 'Lobby')$$, 'sending resumes after revocation');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
insert into restriction_fixture select 'second', id from public.admin_restrict_emergency_sender(24, 'Repeated misuse again', '90000000-0000-0000-0000-000000000002');
select ok((select restricted_until between clock_timestamp() + interval '23 hours 59 minutes' and clock_timestamp() + interval '24 hours 1 minute'
  from public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')), '24 hours measured by server');
select throws_ok($$select public.admin_revoke_emergency_send_restriction((select id from restriction_fixture where name = 'first'), '90000000-0000-0000-0000-000000000002')$$, '40001', 'Emergency send restriction has changed. Refresh and try again.', 'stale screen cannot revoke newer restriction');
reset role;
select is((select count(*)::int from public.emergency_send_restrictions), 2, 'previous history preserved');
update public.emergency_send_restrictions set created_at = clock_timestamp() - interval '25 hours', restricted_until = clock_timestamp() - interval '1 hour'
  where id = (select id from restriction_fixture where name = 'second');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is(public.get_my_emergency_send_restriction(), null::timestamptz, 'expired restriction automatically disappears');
select lives_ok($$select public.submit_emergency_request('travel', 'Help after expiry', 'Bus')$$, 'sending resumes without a scheduler');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.admin_restrict_emergency_sender(1, 'Another misuse incident', '90000000-0000-0000-0000-000000000002')$$, 'can restrict again after expiry');
select lives_ok($$select public.admin_delete_emergency_request((select id from restriction_fixture where name = 'request'))$$, 'admin can remove original abusive request');
select ok((select count(*) = 1 from public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')), 'deleting source request preserves account restriction');
select lives_ok($$select public.admin_restrict_emergency_sender(null, 'Staff misuse incident', '90000000-0000-0000-0000-000000000003')$$, 'staff can also be restricted until release');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000006', true);
insert into restriction_fixture select 'new-request', request_id from public.submit_emergency_request('medical', 'New help for medical', 'Lobby');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000003', true);
select ok(exists(select 1 from public.list_my_emergency_messages() where request_id = (select id from restriction_fixture where name = 'new-request')), 'restricted staff still receive emergencies');
select lives_ok($$select public.complete_emergency_request((select id from restriction_fixture where name = 'new-request'))$$, 'restricted staff can still handle incoming emergencies');
select is(public.get_my_emergency_send_restriction(), 'infinity'::timestamptz, 'staff own status identifies manual release');

select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select public.admin_revoke_emergency_send_restriction(
  (select id from public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')),
  '90000000-0000-0000-0000-000000000002');
insert into restriction_fixture select 'permanent', id from public.admin_restrict_emergency_sender(
  null, 'Requires manual release', '90000000-0000-0000-0000-000000000002');
select is((select restricted_until from public.admin_get_emergency_send_restriction('90000000-0000-0000-0000-000000000002')),
  'infinity'::timestamptz, 'admin status returns no expiry until release');
select throws_ok($$select public.admin_restrict_emergency_sender(1, 'Replace manual release', '90000000-0000-0000-0000-000000000002')$$,
  '55000', 'An active emergency send restriction already exists.', 'timed restriction cannot overwrite manual release');
reset role;
update public.emergency_send_restrictions set created_at = clock_timestamp() - interval '10 years'
  where id = (select id from restriction_fixture where name = 'permanent');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is(public.get_my_emergency_send_restriction(), 'infinity'::timestamptz, 'manual release restriction does not expire with age');
select throws_ok($$select public.submit_emergency_request('medical', 'Blocked until manual release', 'Lobby')$$,
  'P0001', 'EMERGENCY_SEND_RESTRICTED', 'manual release blocks medical emergencies');
select throws_ok($$select public.submit_emergency_request('travel', 'Blocked until manual release', 'Lobby')$$,
  'P0001', 'EMERGENCY_SEND_RESTRICTED', 'manual release blocks organizational emergencies');
do $$
declare error_detail text;
begin
  begin
    perform public.submit_emergency_request('medical', 'Inspect manual release error', 'Lobby');
  exception when sqlstate 'P0001' then
    get stacked diagnostics error_detail = pg_exception_detail;
  end;
  perform public.is(error_detail::jsonb, '{"restricted_until":"infinity"}'::jsonb, 'rejection detail serializes manual release without private data');
end;
$$;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.admin_revoke_emergency_send_restriction((select id from restriction_fixture where name = 'permanent'),
  '90000000-0000-0000-0000-000000000002')$$, 'admin explicitly releases indefinite restriction');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', true);
select is(public.get_my_emergency_send_restriction(), null::timestamptz, 'manual release clears own status');
select lives_ok($$select public.submit_emergency_request('medical', 'Sending after manual release', 'Lobby')$$, 'sending resumes after explicit release');
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select public.admin_restrict_emergency_sender(null, 'New manual release restriction', '90000000-0000-0000-0000-000000000002');
reset role;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000001', true);
select throws_ok($$insert into public.emergency_requests(requester_profile_id, requester_display_name, target_team, message, location_label)
  select id, display_name, 'medical', 'Privileged bypass attempt', 'Lobby' from public.profiles where user_id = '90000000-0000-0000-0000-000000000002'$$,
  'P0001', 'EMERGENCY_SEND_RESTRICTED', 'trigger also guards privileged direct inserts');
update public.profiles set role = 'admin' where user_id = '90000000-0000-0000-0000-000000000006';
delete from auth.users where id = '90000000-0000-0000-0000-000000000001';
select ok((select bool_and(created_by_profile_id is null and created_by_display_name = 'Restriction Admin') from public.emergency_send_restrictions), 'admin deletion retains audit name');
delete from auth.users where id = '90000000-0000-0000-0000-000000000002';
select is((select count(*)::int from public.emergency_send_restrictions), 1, 'sender deletion removes only their moderation records');

select * from finish();
rollback;
