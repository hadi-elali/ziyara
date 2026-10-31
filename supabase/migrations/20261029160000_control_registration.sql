-- One persistent, global switch. Clients can only read it through the getter;
-- changing it requires a verified admin profile, even with a forged client UI.
create table public.registration_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true
);

insert into public.registration_settings (id, enabled) values (1, true);
alter table public.registration_settings enable row level security;
revoke all on public.registration_settings from public, anon, authenticated;

create function public.get_registration_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.registration_settings where id = 1), false);
$$;

revoke all on function public.get_registration_enabled() from public;
grant execute on function public.get_registration_enabled() to anon, authenticated;

create function public.admin_set_registration_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce((select public.is_admin()), false) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  if p_enabled is null then
    raise exception 'Registration setting must be a boolean.' using errcode = '23514';
  end if;

  insert into public.registration_settings (id, enabled) values (1, p_enabled)
  on conflict (id) do update set enabled = excluded.enabled;
  return p_enabled;
end;
$$;

revoke all on function public.admin_set_registration_enabled(boolean) from public, anon;
grant execute on function public.admin_set_registration_enabled(boolean) to authenticated;

-- Enforce this inside Auth's user-creation transaction, including old clients,
-- direct signup requests and admin-created accounts. Existing users, sign-in,
-- token refresh, email confirmation and password recovery do not insert users.
create function public.enforce_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  registration_enabled boolean;
begin
  -- Serialize account creation with closing registration: once closing has
  -- committed, no later creation can use a previously read, enabled setting.
  select enabled into registration_enabled
  from public.registration_settings where id = 1 for share;

  if registration_enabled is distinct from true then
    raise exception 'Registration is currently disabled.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_registration_enabled() from public, anon, authenticated;
create trigger enforce_registration_enabled
before insert on auth.users
for each row execute function public.enforce_registration_enabled();
