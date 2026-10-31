-- Push planning is a separate action on an already published program.
-- Updating only the schedule preserves simultaneous edits to its content.
create function public.admin_schedule_daily_program_push(
  p_program_id bigint,
  p_scheduled_at timestamptz
)
returns public.daily_programs
language plpgsql security definer set search_path = '' as $$
declare saved public.daily_programs;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;
  update public.daily_programs set push_scheduled_at = p_scheduled_at
    where id = p_program_id returning * into saved;
  if not found then
    raise exception 'Daily program not found.' using errcode = 'P0002';
  end if;
  return saved;
end;
$$;
revoke all on function public.admin_schedule_daily_program_push(bigint, timestamptz) from public, anon;
grant execute on function public.admin_schedule_daily_program_push(bigint, timestamptz) to authenticated;
