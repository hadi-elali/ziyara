-- The project owner's existing switch is public.lock_app, row id = 1.
-- Preserve an existing true value when bringing the table under migrations.
create table if not exists public.lock_app (
  id int8 primary key default 1,
  lock boolean not null default false
);

alter table public.lock_app alter column lock set default false;

-- OVERRIDING also supports an existing GENERATED ALWAYS identity id.
insert into public.lock_app (id, lock) overriding system value
values (1, false)
on conflict (id) do nothing;

alter table public.lock_app enable row level security;
revoke all on table public.lock_app from public, anon, authenticated;
grant select on table public.lock_app to anon, authenticated;
grant all on table public.lock_app to service_role;

drop policy if exists "Home lock is publicly readable" on public.lock_app;
create policy "Home lock is publicly readable"
on public.lock_app for select to anon, authenticated
using (id = 1);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'lock_app'
     ) then
    alter publication supabase_realtime add table public.lock_app;
  end if;
end;
$$;

notify pgrst, 'reload schema';
