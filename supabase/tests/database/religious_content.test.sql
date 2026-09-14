begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

select has_table(
  'public',
  'religious_contents',
  'the religious-content metadata table exists'
);
select has_table(
  'public',
  'religious_text_paragraphs',
  'the ordered religious paragraph table exists'
);
select has_column(
  'public',
  'religious_text_paragraphs',
  'arabic',
  'a paragraph contains Arabic text'
);
select has_column(
  'public',
  'religious_text_paragraphs',
  'transliteration',
  'a paragraph contains transliteration'
);
select has_column(
  'public',
  'religious_text_paragraphs',
  'translation_de',
  'a paragraph contains its German translation'
);
select has_column(
  'public',
  'religious_text_paragraphs',
  'position',
  'a paragraph contains an explicit position'
);

select ok(
  has_table_privilege('anon', 'public.religious_contents', 'select'),
  'anonymous readers can select published content metadata'
);
select ok(
  has_table_privilege('anon', 'public.religious_text_paragraphs', 'select'),
  'anonymous readers can select published paragraphs'
);
select ok(
  not has_table_privilege('anon', 'public.religious_contents', 'insert'),
  'anonymous readers cannot create content metadata'
);
select ok(
  not has_table_privilege('authenticated', 'public.religious_text_paragraphs', 'insert'),
  'authenticated readers cannot create paragraphs directly'
);

select throws_ok(
  $$
    insert into public.religious_contents (
      id,
      slug,
      title,
      content_type,
      source_references,
      verification_status,
      content_policy,
      reviewed_by,
      reviewed_at,
      version,
      is_published
    ) values (
      'invalid-publication',
      'invalid-publication',
      'Invalid publication',
      'dua',
      array['source'],
      'needs_review',
      'pending_rights_review',
      null,
      null,
      '1.0.0',
      true
    )
  $$,
  '23514',
  null,
  'unreviewed content cannot be published'
);

insert into public.religious_contents (
  id,
  slug,
  title,
  content_type,
  source_references,
  verification_status,
  content_policy,
  reviewed_by,
  reviewed_at,
  version,
  is_published
) values
  (
    'published-test-content',
    'published-test-content',
    'Published test content',
    'dua',
    array['qualified-source'],
    'verified',
    'approved_for_offline',
    'Qualified reviewer',
    now(),
    '1.0.0',
    true
  ),
  (
    'draft-test-content',
    'draft-test-content',
    'Draft test content',
    'dua',
    array['source-under-review'],
    'needs_review',
    'pending_rights_review',
    null,
    null,
    '0.1.0',
    false
  );

insert into public.religious_text_paragraphs (
  content_id,
  position,
  arabic,
  transliteration,
  translation_de
) values
  ('published-test-content', 0, 'arabic-a', 'latin-a', 'deutsch-a'),
  ('published-test-content', 1, 'arabic-b', 'latin-b', 'deutsch-b'),
  ('draft-test-content', 0, 'arabic-draft', 'latin-draft', 'deutsch-draft');

select throws_ok(
  $$
    insert into public.religious_text_paragraphs (
      content_id,
      position,
      arabic,
      transliteration,
      translation_de
    ) values (
      'draft-test-content',
      1,
      '',
      '',
      ''
    )
  $$,
  '23514',
  null,
  'a stored paragraph requires at least one text component'
);

select set_config('request.jwt.claim.sub', '', true);
set local role anon;

select is(
  (select count(*) from public.religious_contents where id = 'published-test-content'),
  1::bigint,
  'anonymous readers see only published and fully reviewed metadata'
);
select is(
  (
    select count(*)
    from public.religious_text_paragraphs
    where content_id = 'published-test-content'
  ),
  2::bigint,
  'anonymous readers see only paragraphs belonging to published content'
);
select results_eq(
  $$
    select position
    from public.religious_text_paragraphs
    where content_id = 'published-test-content'
    order by position
  $$,
  array[0, 1],
  'paragraph positions provide a deterministic reading order'
);

select * from finish();
rollback;
