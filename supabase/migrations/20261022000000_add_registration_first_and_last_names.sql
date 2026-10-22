-- Support both the repository's legacy display_name schema and profiles with
-- name/surname already present. Keep display_name for existing reads and RPCs.
alter table public.profiles
  add column if not exists name text,
  add column if not exists surname text,
  add column if not exists display_name text;

-- Preserve legacy names verbatim rather than guessing first/last-name splits.
update public.profiles set name = display_name where name is null;
update public.profiles
set display_name = left(concat_ws(' ', name, nullif(btrim(surname), '')), 80)
where display_name is null;

alter table public.profiles
  alter column name set not null,
  alter column display_name set not null,
  add constraint profiles_first_name_check check (char_length(name) between 2 and 80);

comment on column public.profiles.name is
  'First name for new registrations; legacy unsplit names are preserved.';
comment on column public.profiles.surname is
  'Last name; nullable for legacy accounts.';
comment on column public.profiles.display_name is
  'Compatibility display label composed from name and surname, limited to 80 characters.';

create function public.sync_profile_names()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.name := coalesce(new.name, new.display_name);
  elsif new.display_name is distinct from old.display_name
    and new.name is not distinct from old.name
    and new.surname is not distinct from old.surname then
    -- Preserve legacy display-name writes without inventing a name split.
    new.name := new.display_name;
    new.surname := null;
  end if;

  new.display_name := left(concat_ws(' ', new.name, nullif(btrim(new.surname), '')), 80);
  return new;
end;
$$;

revoke all on function public.sync_profile_names() from public, anon, authenticated;

create trigger sync_profile_names
before insert or update of name, surname, display_name on public.profiles
for each row execute function public.sync_profile_names();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
  requested_luggage_count int8 := 0;
  requested_member_type public.member_type := null;
  requested_party_size int8 := 1;
  requested_sim_card_count int8 := 0;
begin
  requested_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Benutzer'
  );
  if char_length(requested_name) < 2 then
    requested_name := 'Benutzer';
  end if;

  if coalesce(new.raw_user_meta_data ->> 'member_type', '') in ('brother', 'sister') then
    requested_member_type := (new.raw_user_meta_data ->> 'member_type')::public.member_type;
  end if;

  if coalesce(new.raw_user_meta_data ->> 'party_size', '') ~ '^[0-9]{1,2}$' then
    requested_party_size := least(greatest((new.raw_user_meta_data ->> 'party_size')::int8, 1), 50);
  end if;

  if coalesce(new.raw_user_meta_data ->> 'luggage_count', '') ~ '^[0-9]{1,2}$' then
    requested_luggage_count := least(greatest((new.raw_user_meta_data ->> 'luggage_count')::int8, 0), 50);
  end if;

  if coalesce(new.raw_user_meta_data ->> 'sim_card_count', '') ~ '^[0-9]{1,2}$' then
    requested_sim_card_count := least(greatest((new.raw_user_meta_data ->> 'sim_card_count')::int8, 0), 50);
  end if;

  insert into public.profiles (
    user_id, name, surname, member_type, party_size, luggage_count, sim_card_count
  ) values (
    new.id,
    left(requested_name, 80),
    nullif(btrim(new.raw_user_meta_data ->> 'surname'), ''),
    requested_member_type,
    requested_party_size,
    requested_luggage_count,
    requested_sim_card_count
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
