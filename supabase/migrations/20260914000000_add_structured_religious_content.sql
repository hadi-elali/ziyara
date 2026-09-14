create table public.religious_contents (
  id text primary key
    check (char_length(btrim(id)) between 2 and 120),
  slug text not null unique
    check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null
    check (char_length(btrim(title)) between 2 and 200),
  content_type text not null
    check (content_type in ('dua', 'ziyarah', 'salawat', 'surah', 'instruction')),
  language text not null default 'Arabisch'
    check (char_length(btrim(language)) between 2 and 80),
  notes text not null default '',
  source_references text[] not null
    check (cardinality(source_references) > 0),
  verification_status text not null default 'draft'
    check (verification_status in ('draft', 'needs_review', 'verified', 'rejected')),
  content_policy text not null default 'pending_rights_review'
    check (
      content_policy in ('linked_not_copied', 'pending_rights_review', 'approved_for_offline')
    ),
  reviewed_by text,
  reviewed_at timestamptz,
  version text not null
    check (char_length(btrim(version)) between 1 and 40),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    not is_published
    or (
      verification_status = 'verified'
      and content_policy = 'approved_for_offline'
      and reviewed_by is not null
      and reviewed_at is not null
    )
  )
);

create table public.religious_text_paragraphs (
  id int8 generated always as identity primary key,
  content_id text not null
    references public.religious_contents (id) on delete cascade,
  position integer not null check (position >= 0),
  arabic text not null check (char_length(btrim(arabic)) > 0),
  transliteration text not null check (char_length(btrim(transliteration)) > 0),
  translation_de text not null check (char_length(btrim(translation_de)) > 0),
  created_at timestamptz not null default now(),
  unique (content_id, position)
);

comment on table public.religious_contents is
  'Metadata and review state for structured Dua and Ziyarat reader content.';

comment on table public.religious_text_paragraphs is
  'Ordered reader paragraphs; Arabic, transliteration and German translation stay in one row.';

create trigger set_religious_contents_updated_at
before update on public.religious_contents
for each row execute function public.set_profile_updated_at();

alter table public.religious_contents enable row level security;
alter table public.religious_text_paragraphs enable row level security;

revoke all on table public.religious_contents from anon, authenticated;
revoke all on table public.religious_text_paragraphs from anon, authenticated;
grant select on table public.religious_contents to anon, authenticated;
grant select on table public.religious_text_paragraphs to anon, authenticated;

create policy "Published religious contents are public"
on public.religious_contents
for select
to anon, authenticated
using (
  is_published
  and verification_status = 'verified'
  and content_policy = 'approved_for_offline'
);

create policy "Published religious paragraphs are public"
on public.religious_text_paragraphs
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.religious_contents as contents
    where contents.id = religious_text_paragraphs.content_id
      and contents.is_published
      and contents.verification_status = 'verified'
      and contents.content_policy = 'approved_for_offline'
  )
);

notify pgrst, 'reload schema';
