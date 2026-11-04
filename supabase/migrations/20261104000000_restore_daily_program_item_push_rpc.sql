-- Restore the RPC expected by already-built clients, including the send-now
-- argument. Use a new migration so databases that recorded the original item
-- migration also receive the current definition and a fresh PostgREST cache.
create or replace function public.admin_schedule_daily_program_item_push(
  p_item_id bigint, p_scheduled_at timestamptz, p_send_now boolean default false
)
returns public.daily_program_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_id bigint;
  saved public.daily_program_items;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select program_id into parent_id from public.daily_program_items where id = p_item_id;
  -- Preserve the program -> item -> job lock order used by edits and dispatch.
  perform 1 from public.daily_programs where id = parent_id for update;
  update public.daily_program_items
    set push_scheduled_at = case when p_send_now then now() else p_scheduled_at end
    where id = p_item_id returning * into saved;
  if not found then
    raise exception 'Daily program item not found.' using errcode = 'P0002';
  end if;

  update public.daily_programs set updated_at = now() where id = parent_id;
  return saved;
end;
$$;

revoke all on function public.admin_schedule_daily_program_item_push(bigint, timestamptz, boolean)
  from public, anon;
grant execute on function public.admin_schedule_daily_program_item_push(bigint, timestamptz, boolean)
  to authenticated;

notify pgrst, 'reload schema';
