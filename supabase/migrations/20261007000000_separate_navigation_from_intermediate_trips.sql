-- Keep existing markers and their optional historical trip reference. Removing a
-- trip must no longer remove its destinations. New destinations are journey-wide.
alter table public.trip_navigation_destinations
  alter column trip_id drop not null,
  drop constraint trip_navigation_destinations_trip_id_fkey,
  add constraint trip_navigation_destinations_trip_id_fkey
    foreign key (trip_id) references public.trips (id) on delete set null;

drop index public.trip_navigation_destinations_active_trip_idx;
create index trip_navigation_destinations_active_idx
on public.trip_navigation_destinations (sort_order, id)
where archived_at is null;

comment on table public.trip_navigation_destinations is
  'Admin-managed journey-wide navigation markers, independent of intermediate trips.';
comment on column public.trip_navigation_destinations.trip_id is
  'Optional historical reference; does not restrict visibility or editing.';

drop policy "Trip members and admins can read active navigation destinations"
on public.trip_navigation_destinations;
create policy "Authenticated users can read active navigation destinations"
on public.trip_navigation_destinations
for select to authenticated
using (archived_at is null);

-- Retain the RPC signature for installed clients. p_trip_id is intentionally
-- ignored; even callers passing an old trip ID create journey-wide destinations.
create or replace function public.admin_upsert_trip_navigation_destination(
  p_trip_id int8,
  p_name text,
  p_latitude double precision,
  p_longitude double precision,
  p_details text,
  p_destination_id int8 default null
)
returns public.trip_navigation_destinations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_profile_id int8;
  next_sort_order int;
  saved_destination public.trip_navigation_destinations;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  select profiles.id into actor_profile_id
  from public.profiles as profiles
  where profiles.user_id = (select auth.uid());

  if p_destination_id is null then
    -- Serialize sort-order allocation without needing an active trip row.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('public.trip_navigation_destinations', 0)
    );
    select coalesce(max(destinations.sort_order), -1) + 1
    into next_sort_order
    from public.trip_navigation_destinations as destinations
    where destinations.archived_at is null;

    insert into public.trip_navigation_destinations (
      name, details, latitude, longitude, sort_order, created_by_profile_id
    ) values (
      btrim(p_name), nullif(btrim(p_details), ''), p_latitude, p_longitude,
      next_sort_order, actor_profile_id
    ) returning * into saved_destination;
  else
    update public.trip_navigation_destinations
    set name = btrim(p_name),
        details = nullif(btrim(p_details), ''),
        latitude = p_latitude,
        longitude = p_longitude
    where id = p_destination_id and archived_at is null
    returning * into saved_destination;

    if not found then
      raise exception 'Active navigation destination not found.' using errcode = 'P0002';
    end if;
  end if;

  return saved_destination;
end;
$$;

create or replace function public.admin_archive_trip_navigation_destination(
  p_destination_id int8
)
returns public.trip_navigation_destinations
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_destination public.trip_navigation_destinations;
begin
  if (select auth.uid()) is null or not (select public.is_admin()) then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  update public.trip_navigation_destinations
  set archived_at = now()
  where id = p_destination_id and archived_at is null
  returning * into saved_destination;

  if not found then
    raise exception 'Active navigation destination not found.' using errcode = 'P0002';
  end if;

  return saved_destination;
end;
$$;

revoke all on function public.admin_upsert_trip_navigation_destination(
  int8, text, double precision, double precision, text, int8
) from public, anon;
revoke all on function public.admin_archive_trip_navigation_destination(int8)
from public, anon;
grant execute on function public.admin_upsert_trip_navigation_destination(
  int8, text, double precision, double precision, text, int8
) to authenticated;
grant execute on function public.admin_archive_trip_navigation_destination(int8)
to authenticated;

notify pgrst, 'reload schema';
