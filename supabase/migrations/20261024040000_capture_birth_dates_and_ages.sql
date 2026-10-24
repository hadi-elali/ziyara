-- Calendar date and age at registration apply to the owner of either account
-- type as well as additional travellers. Do not backfill missing birth dates.
alter table public.profiles add column birth_date date;
comment on column public.profiles.birth_date is
  'Account owner birth date supplied at registration. Null for older clients/accounts; no inference from age.';
comment on column public.profiles.family_members is
  'Registration snapshot of additional travellers: [{name, surname, birth_date?, age?}]. Dates use YYYY-MM-DD; age is completed years at registration. Older clients/snapshots may omit dates/ages.';

create function public.parse_registration_birth_date(p_value jsonb)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  supplied_text text;
  parsed_date date;
begin
  if jsonb_typeof(p_value) is distinct from 'string' then
    raise exception 'Birth dates must use YYYY-MM-DD.' using errcode = '23514';
  end if;
  supplied_text := p_value #>> '{}';
  if supplied_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Birth dates must use YYYY-MM-DD.' using errcode = '23514';
  end if;
  begin
    parsed_date := supplied_text::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'Birth dates must be valid calendar dates.' using errcode = '23514';
  end;
  if parsed_date > current_date then
    raise exception 'Birth dates cannot be in the future.' using errcode = '23514';
  end if;
  return parsed_date;
end;
$$;
revoke all on function public.parse_registration_birth_date(jsonb) from public, anon, authenticated;

create function public.capture_registration_birth_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied_date jsonb;
  expected_age int;
begin
  select users.raw_user_meta_data -> 'birth_date' into supplied_date
  from auth.users as users where users.id = new.user_id;
  if supplied_date is null then
    return new;
  end if;
  new.birth_date := public.parse_registration_birth_date(supplied_date);
  expected_age := extract(year from age(current_date, new.birth_date))::int;
  if expected_age not between 0 and 120
    or (new.age is not null and new.age::text::int <> expected_age) then
    raise exception 'Age must match the birth date and be between 0 and 120.' using errcode = '23514';
  end if;
  -- Assignment supports both the fresh numeric and historical text age column.
  new.age := expected_age;
  return new;
end;
$$;
revoke all on function public.capture_registration_birth_date() from public, anon, authenticated;
create trigger capture_birth_date_before_profile_insert
before insert on public.profiles
for each row execute function public.capture_registration_birth_date();

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
  member_birth_date date;
  member_age int;
  normalized_members jsonb := '[]'::jsonb;
begin
  select users.raw_user_meta_data -> 'family_members' into supplied_members
  from auth.users as users where users.id = new.user_id;
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
    member_birth_date := null;
    if member ? 'birth_date' then
      member_birth_date := public.parse_registration_birth_date(member -> 'birth_date');
      normalized_member := normalized_member || jsonb_build_object('birth_date', member ->> 'birth_date');
    end if;
    -- Older clients without ages or birthdays remain supported. When supplied,
    -- age must be a whole JSON number and agree with any supplied birth date.
    if member ? 'age' then
      if jsonb_typeof(member -> 'age') is distinct from 'number'
        or (member ->> 'age') !~ '^[0-9]{1,3}$' then
        raise exception 'Family member age must be a whole number between 0 and 120.' using errcode = '23514';
      end if;
      member_age := (member ->> 'age')::int;
      if member_age > 120 or (member_birth_date is not null
        and member_age <> extract(year from age(current_date, member_birth_date))::int) then
        raise exception 'Age must match the birth date and be between 0 and 120.' using errcode = '23514';
      end if;
      normalized_member := normalized_member || jsonb_build_object('age', member_age);
    end if;
    normalized_members := normalized_members || jsonb_build_array(normalized_member);
  end loop;
  new.family_members := normalized_members;
  new.party_size := 1 + jsonb_array_length(normalized_members);
  return new;
end;
$$;
revoke all on function public.capture_registration_family_members() from public, anon, authenticated;

-- Keep existing own-profile/admin RLS, no new client write permission.
notify pgrst, 'reload schema';
