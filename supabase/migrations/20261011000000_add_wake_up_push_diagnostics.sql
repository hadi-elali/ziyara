alter table public.wake_up_notification_attempts
  add column error_code text
    check (error_code is null or error_code ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  add column expo_http_status smallint
    check (expo_http_status is null or expo_http_status between 100 and 599),
  add column expo_ticket_id uuid;

comment on column public.wake_up_notification_attempts.error_code is
  'Structured Expo or transport error identifier only. Never store raw messages, tokens or payloads. Historical failures remain unknown.';
comment on column public.wake_up_notification_attempts.expo_http_status is
  'HTTP status from the Expo send request; null if no response was received.';
comment on column public.wake_up_notification_attempts.expo_ticket_id is
  'Accepted Expo ticket ID for subsequent receipt diagnostics; not proof of device delivery.';
