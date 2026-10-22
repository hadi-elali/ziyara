-- Reuse an existing age column without changing its type or stored values.
-- On a fresh schema, age is nullable for legacy accounts and clients.
alter table public.profiles
  add column if not exists age int2;

-- Support both numeric columns and the existing remote text column. CASE guards
-- the cast against malformed legacy text and integer overflow. NOT VALID keeps
-- existing values unchanged while enforcing the rule on new writes.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_registration_age_check'
  ) then
    alter table public.profiles
      add constraint profiles_registration_age_check check (
        age is null or case
          when btrim(age::text) ~ '^[0-9]{1,3}$'
            then btrim(age::text)::int between 0 and 120
          else false
        end
      ) not valid;
  end if;
end;
$$;

comment on column public.profiles.age is
  'Age in completed years at registration; null when not supplied by a legacy client.';

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
