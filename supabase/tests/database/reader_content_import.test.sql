begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data) values
 ('89130000-0000-0000-0000-000000000001', 'reader-admin@example.invalid', '{"display_name":"Reader Admin","name":"Reader","surname":"Admin","age":30}'),
 ('89130000-0000-0000-0000-000000000002', 'reader-user@example.invalid', '{"display_name":"Reader User","name":"Reader","surname":"User","age":30}');
update public.profiles set role = 'admin' where user_id = '89130000-0000-0000-0000-000000000001';

create temporary table reader_test_payload as select
 '{"id":"reader-import-test","slug":"reader-import-test","title":"Synthetic reader sample","source_title":"Test source","source_url":"https://example.invalid/source","place_ids":["place-imam-hussain"],"publish":false,"content_reviewed":false,"rights_reviewed":false,"unresolved_blocks":[]}'::jsonb as meta,
 '[{"kind":"introduction","translation_de":"Synthetic introduction"},{"kind":"text","arabic":"نص تجريبي","transliteration":"synthetic latin","translation_de":"Deutsch","translation_en":"English"},{"kind":"note","translation_en":"**Synthetic note**"}]'::jsonb as blocks;
grant select on reader_test_payload to authenticated;

select has_column('public', 'religious_text_paragraphs', 'translation_en', 'English paragraphs exist');
select has_column('public', 'religious_text_paragraphs', 'block_kind', 'block roles exist');
select has_table('public', 'religious_content_imports', 'original imports have private storage');
select ok(not has_function_privilege('anon', 'public.admin_save_reader_content(jsonb,jsonb,text,text,timestamptz)', 'execute'), 'anonymous writes are not granted');
select ok(not has_table_privilege('authenticated', 'public.religious_text_paragraphs', 'insert'), 'direct paragraph writes remain revoked');
select ok(not has_table_privilege('authenticated', 'public.religious_content_imports', 'update'), 'direct import writes remain revoked');

select set_config('request.jwt.claim.sub', '89130000-0000-0000-0000-000000000002', true);
set local role authenticated;
select throws_ok($$select public.admin_save_reader_content(meta, blocks, 'original', 'de', null) from reader_test_payload$$, '42501', null, 'ordinary users cannot save reader text');
reset role;
select set_config('request.jwt.claim.sub', '89130000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.admin_save_reader_content(meta, blocks, 'original', 'de', null) from reader_test_payload$$, 'admin saves draft atomically');
select is((select count(*) from public.religious_contents where id = 'reader-import-test'), 1::bigint, 'admin can reopen draft');
select is((select count(*) from public.religious_text_paragraphs where content_id = 'reader-import-test'), 3::bigint, 'admin can reopen all draft blocks');
select is((select raw_text from public.religious_content_imports where content_id = 'reader-import-test'), 'original', 'original text persisted');
select is((select translation_en from public.religious_text_paragraphs where content_id = 'reader-import-test' and position = 1), 'English', 'English remains beside its matching Arabic and German');
select is((select verification_status from public.religious_contents where id = 'reader-import-test'), 'needs_review', 'saving does not claim a specialist review');
select throws_ok($$select public.admin_save_reader_content(meta || '{"publish":true,"content_reviewed":true,"rights_reviewed":true,"unresolved_blocks":[1]}', blocks, '', '', (select updated_at from public.religious_contents where id = 'reader-import-test')) from reader_test_payload$$, '22023', null, 'unresolved assignments cannot be published');
select throws_ok($$select public.admin_save_reader_content(meta, '[{}]', 'lost input', '', (select updated_at from public.religious_contents where id = 'reader-import-test')) from reader_test_payload$$, '22023', null, 'empty blocks are rejected');
select is((select raw_text from public.religious_content_imports where content_id = 'reader-import-test'), 'original', 'failed validation preserves original input');
select throws_ok($$select public.admin_save_reader_content(meta, blocks, '', '', '2000-01-01'::timestamptz) from reader_test_payload$$, '40001', null, 'stale editors cannot overwrite newer content');
select throws_ok($$select public.admin_save_reader_content(meta, blocks, '', '', null) from reader_test_payload$$, '40001', null, 'creating with an existing ID cannot overwrite it');
select throws_ok($$select public.admin_save_reader_content(meta || '{"slug":"changed-link"}', blocks, '', '', (select updated_at from public.religious_contents where id = 'reader-import-test')) from reader_test_payload$$, '22023', null, 'saved links remain stable for bookmarks');
reset role;

select set_config('request.jwt.claim.sub', '89130000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.religious_contents where id = 'reader-import-test'), 0::bigint, 'draft metadata is hidden from users');
select is((select count(*) from public.religious_text_paragraphs where content_id = 'reader-import-test'), 0::bigint, 'draft blocks are hidden from users');
select is((select count(*) from public.religious_content_imports where content_id = 'reader-import-test'), 0::bigint, 'original input is hidden from users');
reset role;
select set_config('request.jwt.claim.sub', '89130000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.admin_save_reader_content(meta || '{"publish":true,"source_title":"","source_url":""}', blocks, 'original', 'de', (select updated_at from public.religious_contents where id = 'reader-import-test')) from reader_test_payload$$, 'text can be published without a source title or attestation');
select is((select reviewed_by from public.religious_contents where id = 'reader-import-test'), null, 'publishing does not invent a reviewer');
select is((select reviewed_at from public.religious_contents where id = 'reader-import-test'), null::timestamptz, 'publishing does not invent a review date');
select is((select verification_status from public.religious_contents where id = 'reader-import-test'), 'needs_review', 'published content retains its pending review status');
select is((select content_policy from public.religious_contents where id = 'reader-import-test'), 'pending_rights_review', 'publishing does not approve rights');
select is((select source_title from public.religious_contents where id = 'reader-import-test'), '', 'no source title is invented');
select is((select source_references from public.religious_contents where id = 'reader-import-test'), array['editorial-review-required'], 'missing source has an explicit review reference');
select is((select is_imported from public.religious_contents where id = 'reader-import-test'), true, 'imports are identifiable without requiring source metadata');
select lives_ok($$select public.admin_save_reader_content(meta || '{"id":"reader-url-test","slug":"reader-url-test","source_title":"","publish":true,"content_reviewed":true,"rights_reviewed":true,"verification_status":"verified","reviewed_by":"invented"}', blocks, 'original', 'de', null) from reader_test_payload$$, 'optional source URL and obsolete client flags are accepted');
select is((select source_title from public.religious_contents where id = 'reader-url-test'), 'https://example.invalid/source', 'URL-only source remains an actual source');
select is((select verification_status from public.religious_contents where id = 'reader-url-test'), 'needs_review', 'obsolete client flags cannot manufacture verification');
select is((select reviewed_by from public.religious_contents where id = 'reader-url-test'), null, 'obsolete client reviewer is ignored');

reset role;
select set_config('request.jwt.claim.sub', '89130000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.religious_contents where id = 'reader-import-test'), 1::bigint, 'published text is reachable by readers');
select is((select array_agg(block_kind order by position) from public.religious_text_paragraphs where content_id = 'reader-import-test'), array['introduction','text','note'], 'block order is preserved');
select is((select count(*) from public.religious_content_imports where content_id = 'reader-import-test'), 0::bigint, 'original stays private after publication');
select throws_ok($$update public.religious_contents set title = 'Changed' where id = 'reader-import-test'$$, '42501', null, 'reader cannot bypass the admin RPC');
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role anon;
select throws_ok($$select * from public.religious_content_imports$$, '42501', null, 'anonymous clients cannot read original imports');
reset role;
select set_config('request.jwt.claim.sub', '89130000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok($$select public.admin_save_reader_content(meta, blocks, 'original', 'de', (select updated_at from public.religious_contents where id = 'reader-import-test')) from reader_test_payload$$, 'admin can return text to draft');
reset role;
select set_config('request.jwt.claim.sub', '89130000-0000-0000-0000-000000000002', true);
set local role authenticated;
select is((select count(*) from public.religious_contents where id = 'reader-import-test'), 0::bigint, 'withdrawn text disappears from online catalog');
reset role;

select * from finish();
rollback;
