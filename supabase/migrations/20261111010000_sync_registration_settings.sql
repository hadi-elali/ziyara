-- Postgres Changes checks SELECT permissions and RLS for every subscriber.
-- Only admins may receive settings events; public reads still use the getter.
grant select on public.registration_settings to authenticated;

create policy "Admins can read registration settings"
on public.registration_settings
for select
to authenticated
using ((select public.is_admin()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'registration_settings'
  ) then
    alter publication supabase_realtime add table public.registration_settings;
  end if;
end;
$$;
