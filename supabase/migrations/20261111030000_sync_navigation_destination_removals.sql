-- Archiving makes a destination invisible under its SELECT policy, preventing
-- its UPDATE from reaching Postgres Changes subscribers. Publish a revision
-- that stays readable without exposing archived names, details or coordinates.
create table public.trip_navigation_state (
  id smallint primary key default 1 check (id = 1),
  revision bigint not null default 0 check (revision >= 0)
);

insert into public.trip_navigation_state (id) values (1);

alter table public.trip_navigation_state enable row level security;
revoke all on table public.trip_navigation_state from anon, authenticated;
grant select on table public.trip_navigation_state to authenticated;

create policy "Authenticated users can read navigation revision"
on public.trip_navigation_state
for select to authenticated
using (id = 1);

create function public.bump_trip_navigation_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.trip_navigation_state set revision = revision + 1 where id = 1;
  return null;
end;
$$;

revoke all on function public.bump_trip_navigation_revision()
from public, anon, authenticated;

create trigger bump_trip_navigation_revision
after insert or update or delete on public.trip_navigation_destinations
for each statement execute function public.bump_trip_navigation_revision();

alter publication supabase_realtime add table public.trip_navigation_state;

notify pgrst, 'reload schema';
