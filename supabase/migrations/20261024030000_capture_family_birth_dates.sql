-- Extend the registration snapshot without changing previously stored rosters.
comment on column public.profiles.family_members is
  'Registration snapshot of additional travellers without their own phone: [{name, surname, birth_date?}]. Birth dates use YYYY-MM-DD; older clients/snapshots may omit them. Excludes the account owner; later party_size edits do not rewrite the snapshot.';

create or replace function public.capture_registration_family_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_members jsonb;
  member jsonb;
  member_name text;
  member_surname text;
  normalized_member jsonb;
  requested_birth_date date;
  birth_date_text text;
  normalized_members jsonb := '[]'::jsonb;
begin
  select users.raw_user_meta_data -> 'family_members'
  into supplied_members
  from auth.users as users
  where users.id = new.user_id;

  if supplied_members is null then
    return new;
  end if;
  if jsonb_typeof(supplied_members) is distinct from 'array' then
    raise exception 'Family members must be a list.' using errcode = '23514';
  end if;
  if jsonb_array_length(supplied_members) > 49 then
    raise exception 'An account cannot represent more than 50 people.' using errcode = '23514';
  end if;

  for member in select value from jsonb_array_elements(supplied_members)
  loop
    if jsonb_typeof(member) is distinct from 'object'
      or jsonb_typeof(member -> 'name') is distinct from 'string'
      or jsonb_typeof(member -> 'surname') is distinct from 'string' then
      raise exception 'Each family member needs a first and last name.' using errcode = '23514';
    end if;
    member_name := btrim(member ->> 'name');
    member_surname := btrim(member ->> 'surname');
    if char_length(member_name) not between 1 and 80
      or char_length(member_surname) not between 1 and 80 then
      raise exception 'Family member names must contain 1 to 80 characters.' using errcode = '23514';
    end if;
    normalized_member := jsonb_build_object('name', member_name, 'surname', member_surname);

    -- New clients require dates. Keep older clients without this key working;
    -- never infer birthdays from ages. A supplied date must always be valid.
    if member ? 'birth_date' then
      if jsonb_typeof(member -> 'birth_date') is distinct from 'string' then
        raise exception 'Birth dates must use YYYY-MM-DD.' using errcode = '23514';
      end if;
      birth_date_text := member ->> 'birth_date';
      if birth_date_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
        raise exception 'Birth dates must use YYYY-MM-DD.' using errcode = '23514';
      end if;
      begin
        requested_birth_date := birth_date_text::date;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Birth dates must be valid calendar dates.' using errcode = '23514';
      end;
      if requested_birth_date > current_date then
        raise exception 'Birth dates cannot be in the future.' using errcode = '23514';
      end if;
      normalized_member := normalized_member || jsonb_build_object('birth_date', birth_date_text);
    end if;
    normalized_members := normalized_members || jsonb_build_array(normalized_member);
  end loop;

  new.family_members := normalized_members;
  new.party_size := 1 + jsonb_array_length(normalized_members);
  return new;
end;
$$;

revoke all on function public.capture_registration_family_members() from public, anon, authenticated;
notify pgrst, 'reload schema';
