-- Commit the enum extension before the following migration uses the new value.
alter type public.app_role add value if not exists 'scholar';
