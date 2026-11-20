-- =====================================================================
--  AROHA — turn on the Lookbook (model photoshoot) section
--  Supabase → SQL Editor → New query → paste this → Run.  Safe to run twice.
-- =====================================================================
alter table public.site_settings
  add column if not exists lookbook_images text[] not null default '{}';
-- Done! You should see "Success. No rows returned".
