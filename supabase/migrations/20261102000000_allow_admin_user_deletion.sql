create function public.admin_delete_user(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_user_id uuid;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'A user ID is required.' using errcode = '22023';
  end if;

  if p_user_id = (select auth.uid()) then
    raise exception 'Administrators cannot delete their own account here.'
      using errcode = '22023';
  end if;

  -- Use the same lock as role changes and the existing auth.users deletion
  -- trigger. Recheck the caller after waiting so a demoted/deleted admin
  -- cannot finish a deletion with an obsolete JWT role or profile snapshot.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('public.admin_set_user_role', 0)
  );

  if not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  -- Hard deletion removes identities, sessions and refresh tokens through
  -- Auth's foreign keys. App data follows its existing cascade/set-null
  -- rules; protect_auth_user_account_deletion still guards the final admin
  -- and anonymizes the retained role audit in this same transaction.
  delete from auth.users as users
  where users.id = p_user_id
  returning users.id into deleted_user_id;

  if deleted_user_id is null then
    raise exception 'User account not found.' using errcode = 'P0002';
  end if;

  return deleted_user_id;
end;
$$;

comment on function public.admin_delete_user(uuid) is
  'Allows a current administrator to permanently delete another Auth account, revoking its sessions and preserving existing deletion protections.';

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;

notify pgrst, 'reload schema';
