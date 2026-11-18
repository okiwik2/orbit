-- Run ONCE in Supabase → SQL Editor after the migration, with your values filled in.
-- Lets the database call the notify function to send push notifications.
insert into private.config (key, value) values
  ('notify_url', 'https://YOUR-PROJECT.supabase.co/functions/v1/notify'),
  ('notify_secret', 'PASTE-THE-SAME-RANDOM-SECRET-YOU-SET-AS-NOTIFY_SECRET')
on conflict (key) do update set value = excluded.value;
