create or replace function public.submit_emergency_request(
  p_target_team text,
  p_message text,
  p_location_label text default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_meters double precision default null
)
returns table (request_id int8, recipient_count int4)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_display_name text;
  actor_profile_id int8;
  clean_location_label text;
  clean_message text;
  created_request_id int8;
  target_role public.app_role;
  target_team text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select profiles.id, profiles.display_name
  into actor_profile_id, actor_display_name
  from public.profiles as profiles
  where profiles.user_id = (select auth.uid());

  if actor_profile_id is null then
    raise exception 'A user profile is required.' using errcode = '42501';
  end if;

  clean_message := btrim(coalesce(p_message, ''));
  clean_location_label := nullif(btrim(coalesce(p_location_label, '')), '');

  if char_length(clean_message) not between 5 and 1200 then
    raise exception 'The emergency message must contain between 5 and 1200 characters.'
      using errcode = '22023';
  end if;

  if clean_location_label is null then
    raise exception 'A location description is required for an emergency request.'
      using errcode = '22023';
  end if;

  if char_length(clean_location_label) > 300 then
    raise exception 'The location description must not exceed 300 characters.'
      using errcode = '22023';
  end if;

  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'Latitude and longitude must be provided together.' using errcode = '22023';
  end if;

  if p_latitude is null and p_accuracy_meters is not null then
    raise exception 'Location accuracy requires coordinates.' using errcode = '22023';
  end if;

  if p_latitude is not null and not (
    p_latitude between -90 and 90
    and p_longitude between -180 and 180
    and (p_accuracy_meters is null or p_accuracy_meters between 0 and 100000)
  ) then
    raise exception 'The provided coordinates are invalid.' using errcode = '22023';
  end if;

  target_team := case lower(btrim(coalesce(p_target_team, '')))
    when 'medical' then 'medical'
    when 'travel' then 'travel'
    else null
  end;
  target_role := case target_team
    when 'medical' then 'medical_staff'::public.app_role
    when 'travel' then 'organization_team'::public.app_role
    else null
  end;

  if target_role is null then
    raise exception 'A valid emergency team is required.' using errcode = '22023';
  end if;

  insert into public.emergency_requests (
    requester_profile_id,
    requester_display_name,
    target_team,
    message,
    location_label,
    latitude,
    longitude,
    accuracy_meters
  )
  values (
    actor_profile_id,
    actor_display_name,
    target_team,
    clean_message,
    clean_location_label,
    p_latitude,
    p_longitude,
    p_accuracy_meters
  )
  returning id into created_request_id;

  insert into public.emergency_request_recipients (request_id, recipient_profile_id)
  select created_request_id, profiles.id
  from public.profiles as profiles
  where profiles.role in (target_role, 'admin'::public.app_role);

  return query
  select created_request_id, count(*)::int4
  from public.emergency_request_recipients as recipients
  where recipients.request_id = created_request_id;
end;
$$;

comment on function public.submit_emergency_request(
  text,
  text,
  text,
  double precision,
  double precision,
  double precision
) is
  'Stores an emergency request and materializes every current member of the selected team plus every administrator as recipients.';

drop function public.admin_set_emergency_duty(uuid, boolean);

notify pgrst, 'reload schema';
