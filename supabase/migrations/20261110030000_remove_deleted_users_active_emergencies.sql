-- Run before the requester foreign key clears the profile reference. This
-- covers admin deletion, self-service Auth deletion and direct profile deletion.
create function public.remove_profile_active_emergencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Keep completed history. Existing cascades remove recipients and private
  -- push attempts for each open request deleted here.
  delete from public.emergency_requests
  where requester_profile_id = old.id
    and completed_at is null;

  return old;
end;
$$;

comment on function public.remove_profile_active_emergencies() is
  'Removes a deleted profile''s open emergency requests atomically with account deletion; completed history is retained.';

revoke all on function public.remove_profile_active_emergencies() from public, anon, authenticated;

create trigger remove_profile_active_emergencies
before delete on public.profiles
for each row
execute function public.remove_profile_active_emergencies();

-- Earlier account deletions left open requests with a null requester. Remove
-- those stale alerts as well, preserving completed requests without a profile.
delete from public.emergency_requests
where requester_profile_id is null
  and completed_at is null;
