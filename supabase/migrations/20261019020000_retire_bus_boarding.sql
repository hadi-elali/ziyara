-- Retire boarding without deleting participant assignments or historical responses.
-- Keep the existing scheduled dispatcher: it also delivers independent wake-up calls.
begin;

-- Revoke the creation entry point used by earlier clients. Direct table writes
-- are already unavailable to clients; existing read/response APIs retain history.
revoke all on function public.admin_start_bus_boarding(bigint, text, timestamptz)
from public, anon, authenticated;

-- Wait for any in-flight creation before closing all active rounds. Existing
-- bus assignment/archive RPCs then remain usable without hidden boarding locks.
lock table public.bus_boardings in share row exclusive mode;
update public.bus_boardings set closed_at = now() where closed_at is null;

commit;
