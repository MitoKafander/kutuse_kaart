-- Phase 17: Remove EV charging feature entirely.
-- Drops the two EV tables; no other tables reference them.
-- Run in Supabase SQL editor, then delete the two EV crons in the Vercel dashboard
-- (Project → Settings → Cron Jobs).

drop table if exists public.ev_prices;
drop table if exists public.ev_chargers;
