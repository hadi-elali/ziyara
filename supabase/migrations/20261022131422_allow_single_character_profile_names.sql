-- The remote constraint profiles_display_name_check still targets name after
-- a historical column rename. Replace both name checks explicitly so either
-- schema accepts a single nonblank character without removing the upper bound.
alter table public.profiles
  drop constraint if exists profiles_display_name_check,
  drop constraint if exists profiles_first_name_check;

alter table public.profiles
  add constraint profiles_first_name_check check (
    char_length(btrim(name)) >= 1 and char_length(name) <= 80
  ),
  add constraint profiles_display_name_check check (
    char_length(btrim(display_name)) >= 1 and char_length(display_name) <= 80
  );

-- The signup trigger must preserve single-character first names as entered.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_age int2 := null;
  age_text text := btrim(new.raw_user_meta_data ->> 'age');
  requested_name text;
  requested_luggage_count int8 := 0;
  requested_member_type public.member_type := null;
  requested_party_size int8 := 1;
  requested_sim_card_count int8 := 0;
begin
  -- Older clients and existing accounts may have no age. Validate supplied ages
  -- before casting so malformed metadata cannot overflow the smallint column.
  if age_text is not null then
    if age_text !~ '^[0-9]{1,3}$' then
      raise exception 'Age must be a whole number between 0 and 120.' using errcode = '23514';
    end if;
    requested_age := age_text::int2;
    if requested_age > 120 then
      raise exception 'Age must be a whole number between 0 and 120.' using errcode = '23514';
    end if;
  end if;

  requested_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Benutzer'
  );
  if char_length(requested_name) < 1 then
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
    user_id, name, surname, age, member_type, party_size, luggage_count, sim_card_count
  ) values (
    new.id,
    left(requested_name, 80),
    nullif(btrim(new.raw_user_meta_data ->> 'surname'), ''),
    requested_age,
    requested_member_type,
    requested_party_size,
    requested_luggage_count,
    requested_sim_card_count
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
