-- These are people represented by one account, not the independently managed
-- account_families membership of registered users. Preserve legacy party sizes.
alter table public.profiles
  add column family_members jsonb not null default '[]'::jsonb
  check (jsonb_typeof(family_members) = 'array' and jsonb_array_length(family_members) <= 49);

comment on column public.profiles.family_members is
  'Registration snapshot of additional travellers without their own phone: [{name, surname}]. Excludes the account owner; legacy accounts have an empty array. Later party_size edits do not rewrite this snapshot.';

-- Capture in the existing signup transaction, including email-confirmation
-- flows. Keep the established name/age/signup function and role defaults intact.
create function public.capture_registration_family_members()
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
  normalized_members jsonb := '[]'::jsonb;
begin
  select users.raw_user_meta_data -> 'family_members'
  into supplied_members
  from auth.users as users
  where users.id = new.user_id;

  -- Metadata absent means an older client. Do not invent missing names or
  -- change its party_size. JSON null and every supplied malformed value fail.
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
    normalized_members := normalized_members || jsonb_build_array(jsonb_build_object(
      'name', member_name, 'surname', member_surname
    ));
  end loop;

  new.family_members := normalized_members;
  -- Derive the signup count from the supplied list, never from a second number.
  new.party_size := 1 + jsonb_array_length(normalized_members);
  return new;
end;
$$;

revoke all on function public.capture_registration_family_members() from public, anon, authenticated;

create trigger capture_family_members_before_profile_insert
before insert on public.profiles
for each row execute function public.capture_registration_family_members();

-- Existing own-profile SELECT/RLS applies; no new client write grant or public
-- read access. Names are a registration snapshot, never a role/identity claim.
notify pgrst, 'reload schema';
