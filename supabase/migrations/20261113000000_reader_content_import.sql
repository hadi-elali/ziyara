begin;

alter table public.religious_contents
  add column place_ids text[] not null default '{}',
  add column source_title text not null default '',
  add column source_url text not null default '';

alter table public.religious_text_paragraphs
  add column translation_en text not null default '',
  add column block_kind text not null default 'text'
    check (block_kind in ('text', 'introduction', 'heading', 'note')),
  alter column arabic set default '',
  alter column transliteration set default '',
  alter column translation_de set default '',
  drop constraint religious_text_paragraphs_has_text,
  add constraint religious_text_paragraphs_has_text check (
    char_length(btrim(arabic || transliteration || translation_de || translation_en)) > 0
  );

-- Original imports are private, even when their edited reader text is public.
create table public.religious_content_imports (
  content_id text primary key references public.religious_contents(id) on delete cascade,
  raw_text text not null default '',
  raw_german text not null default '',
  unresolved_blocks integer[] not null default '{}'
);
alter table public.religious_content_imports enable row level security;
revoke all on public.religious_content_imports from public, anon, authenticated;
grant select on public.religious_content_imports to authenticated;
create policy "Admins read original reader imports" on public.religious_content_imports
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read reader drafts" on public.religious_contents
  for select to authenticated using ((select public.is_admin()));
create policy "Admins read draft paragraphs" on public.religious_text_paragraphs
  for select to authenticated using ((select public.is_admin()));

-- A single transaction saves metadata, edited blocks and original input.
-- All public mutation grants remain revoked; the RPC checks the current admin.
create function public.admin_save_reader_content(
  p_content jsonb,
  p_paragraphs jsonb,
  p_raw_text text,
  p_raw_german text,
  p_expected_updated_at timestamptz default null
) returns public.religious_contents
language plpgsql security definer set search_path = '' as $$
declare
  saved public.religious_contents;
  previous public.religious_contents;
  entry_id text := p_content ->> 'id';
  publish boolean := coalesce((p_content ->> 'publish')::boolean, false);
  places text[];
  unresolved integer[];
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_content) is distinct from 'object'
    or entry_id is null or entry_id !~ '^[a-z0-9][a-z0-9-]{1,119}$'
    or coalesce(char_length(btrim(p_content ->> 'title')), 0) not between 2 and 200
    or coalesce(char_length(btrim(p_content ->> 'source_title')), 0) not between 2 and 500
    or coalesce(p_content ->> 'slug', '') !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or char_length(p_content ->> 'slug') > 120
    or char_length(coalesce(p_content ->> 'notes', '')) > 10000
    or char_length(coalesce(p_content ->> 'source_url', '')) > 2000
    or (coalesce(p_content ->> 'source_url', '') <> '' and (p_content ->> 'source_url') !~ '^https?://[^[:space:]]+$')
    or jsonb_typeof(p_content -> 'place_ids') is distinct from 'array'
    or jsonb_typeof(p_paragraphs) is distinct from 'array'
    or char_length(coalesce(p_raw_text, '')) > 2000000
    or char_length(coalesce(p_raw_german, '')) > 2000000
    or octet_length(p_paragraphs::text) > 8000000 then
    raise exception 'Invalid reader content.' using errcode = '22023';
  end if;
  select array_agg(value) into places from jsonb_array_elements_text(p_content -> 'place_ids');
  select coalesce(array_agg(value::integer), '{}') into unresolved
    from jsonb_array_elements_text(coalesce(p_content -> 'unresolved_blocks', '[]'));
  if coalesce(cardinality(places), 0) not between 1 and 50
    or exists (select 1 from unnest(places) as id where id !~ '^[a-z0-9][a-z0-9-]{1,119}$')
    or jsonb_array_length(p_paragraphs) not between 1 and 5000 then
    raise exception 'Choose a place and provide text.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_paragraphs) as block where
      jsonb_typeof(block) <> 'object'
      or coalesce(block ->> 'kind', 'text') not in ('text', 'introduction', 'heading', 'note')
      or char_length(btrim(coalesce(block ->> 'arabic', '') || coalesce(block ->> 'transliteration', '')
        || coalesce(block ->> 'translation_de', '') || coalesce(block ->> 'translation_en', ''))) = 0
      or exists (
        select 1 from jsonb_each(block) as field where field.key in ('arabic', 'transliteration', 'translation_de', 'translation_en')
          and (jsonb_typeof(field.value) <> 'string' or char_length(field.value #>> '{}') > 50000)
      )
  ) then
    raise exception 'Invalid or empty reader block.' using errcode = '22023';
  end if;
  if publish and (coalesce((p_content ->> 'content_reviewed')::boolean, false) = false
    or coalesce((p_content ->> 'rights_reviewed')::boolean, false) = false
    or cardinality(unresolved) > 0) then
    raise exception 'Confirm content and rights review before publishing.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('reader-content:' || entry_id, 0));
  -- Serialize against admin role removal as well as another editor of this text.
  perform 1 from public.profiles where user_id = (select auth.uid()) and role = 'admin' for share;
  if not found then raise exception 'Admin access required.' using errcode = '42501'; end if;
  select * into previous from public.religious_contents where id = entry_id for update;
  if previous.id is not null and (p_expected_updated_at is null or previous.updated_at <> p_expected_updated_at) then
    raise exception 'This text has changed. Reload it before saving.' using errcode = '40001';
  end if;
  if previous.id is null and p_expected_updated_at is not null then
    raise exception 'Reader content no longer exists.' using errcode = '40001';
  end if;
  -- Preserve bundled entries: the editor manages only imported content.
  if previous.id is not null and previous.source_title = '' then
    raise exception 'Bundled content is managed in the source repository.' using errcode = '22023';
  end if;
  if previous.id is not null and previous.slug <> p_content ->> 'slug' then
    raise exception 'The link name cannot change after the first save.' using errcode = '22023';
  end if;

  insert into public.religious_contents (
    id, slug, title, content_type, language, notes, source_references, verification_status,
    content_policy, reviewed_by, reviewed_at, version, is_published, place_ids, source_title, source_url
  ) values (
    entry_id, p_content ->> 'slug', btrim(p_content ->> 'title'), coalesce(p_content ->> 'content_type', 'ziyarah'),
    'Arabisch / Deutsch / English', coalesce(p_content ->> 'notes', ''), array['import-' || entry_id],
    case when publish then 'verified' else 'needs_review' end,
    case when publish then 'approved_for_offline' else 'pending_rights_review' end,
    case when publish then (select auth.uid())::text else null end,
    case when publish then clock_timestamp() else null end,
    '1.0.0', publish, places, btrim(p_content ->> 'source_title'), coalesce(p_content ->> 'source_url', '')
  ) on conflict (id) do update set
    slug = excluded.slug, title = excluded.title, content_type = excluded.content_type,
    notes = excluded.notes, source_references = excluded.source_references,
    verification_status = excluded.verification_status, content_policy = excluded.content_policy,
    reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at,
    is_published = excluded.is_published, place_ids = excluded.place_ids,
    source_title = excluded.source_title, source_url = excluded.source_url
  returning * into saved;

  delete from public.religious_text_paragraphs where content_id = entry_id;
  insert into public.religious_text_paragraphs (content_id, position, block_kind, arabic, transliteration, translation_de, translation_en)
  select entry_id, (ordinality - 1)::integer, coalesce(block ->> 'kind', 'text'),
    coalesce(block ->> 'arabic', ''), coalesce(block ->> 'transliteration', ''),
    coalesce(block ->> 'translation_de', ''), coalesce(block ->> 'translation_en', '')
  from jsonb_array_elements(p_paragraphs) with ordinality as blocks(block, ordinality);

  insert into public.religious_content_imports values (entry_id, coalesce(p_raw_text, ''), coalesce(p_raw_german, ''), unresolved)
    on conflict (content_id) do update set raw_text = excluded.raw_text, raw_german = excluded.raw_german,
      unresolved_blocks = excluded.unresolved_blocks;
  return saved;
end;
$$;
revoke all on function public.admin_save_reader_content(jsonb, jsonb, text, text, timestamptz) from public, anon;
grant execute on function public.admin_save_reader_content(jsonb, jsonb, text, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';
commit;
