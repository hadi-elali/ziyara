-- Login and registration need Postgres Changes before a session exists.
-- This singleton contains only the already-public availability Boolean and id.
-- SELECT plus RLS is required for Realtime; writes remain admin-RPC-only.
grant select on public.registration_settings to anon, authenticated;

drop policy "Admins can read registration settings" on public.registration_settings;

create policy "Clients can read registration availability"
on public.registration_settings
for select
to anon, authenticated
using (id = 1);
