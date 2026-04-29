-- Phase 47: close Supabase `security_definer_view` advisory on all 8
-- public views.
--
-- Postgres views default to `security_invoker = false`, meaning the view
-- executes with the creator's privileges and RLS on underlying tables is
-- evaluated against the creator's role — not the caller's. Supabase's
-- linter names this "SECURITY DEFINER" (confusingly) and flags it as an
-- ERROR for every public view without the `security_invoker = true`
-- option explicitly set.
--
-- Today the leak is mostly latent — every table the views read
-- (`prices`, `stations`, `votes`, `parishes`, `maakonnad`) has a public
-- SELECT policy, so the creator-vs-caller distinction changes nothing.
-- The one real gap is `v_discovery_leaderboard`: it reads
-- `share_discovery_publicly` from `user_profiles` directly, and
-- `user_profiles` has a restricted SELECT policy (`auth.uid() = id`).
-- With `security_invoker = true`, that subquery would only see the
-- caller's own row and the "Vaata kaarti" button for opted-in users
-- would break.
--
-- Fix: introduce a second security-definer helper
-- (`public.get_share_discovery_publicly`) mirroring the phase 45
-- `get_display_name` pattern, rewrite `v_discovery_leaderboard` to use
-- it, then set `security_invoker = true` on all 8 views.
--
-- Flagged views (all in `public`):
--   v_prices_earning, v_user_discoveries, v_user_parish_progress,
--   v_leaderboard_7d, v_leaderboard_30d, v_leaderboard_all,
--   v_reporters, v_discovery_leaderboard.
--
-- Rollback: `alter view … reset (security_invoker)` on each view (back
-- to default = false), and re-apply schema_phase45_auth_users_unexpose.sql
-- to restore the previous v_discovery_leaderboard body. The
-- `get_share_discovery_publicly` function can be left unreferenced or
-- dropped with `drop function public.get_share_discovery_publicly(uuid);`.

-- 1. Security-definer share-flag resolver. Same hardening shape as
--    `get_display_name` (phase 45) and `get_user_footprint` (phase 30).
create or replace function public.get_share_discovery_publicly(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select share_discovery_publicly from public.user_profiles where id = uid),
    false
  );
$$;

grant execute on function public.get_share_discovery_publicly(uuid) to anon, authenticated;

-- 2. Rewrite v_discovery_leaderboard to call the helper instead of
--    reading user_profiles.share_discovery_publicly directly. All other
--    columns / CTEs / ordering / LIMIT preserved so `create or replace`
--    succeeds without a drop.
create or replace view v_discovery_leaderboard as
with parish_done as (
  select user_id, parish_id, maakond_id
  from v_user_parish_progress
  where stations_contributed >= stations_total
),
maakond_progress as (
  select
    pd.user_id,
    pd.maakond_id,
    count(*) as parishes_done,
    (select count(*) from parishes p2
       where p2.maakond_id = pd.maakond_id and p2.station_count > 0) as parishes_total
  from parish_done pd
  group by pd.user_id, pd.maakond_id
),
totals as (
  select user_id, count(*) as stations_contributed
  from v_user_discoveries
  group by user_id
)
select
  t.user_id,
  public.get_display_name(t.user_id) as display_name,
  public.get_share_discovery_publicly(t.user_id) as share_discovery_publicly,
  coalesce((
    select count(*) from maakond_progress mp
    where mp.user_id = t.user_id
      and mp.parishes_total > 0
      and mp.parishes_done >= mp.parishes_total
  ), 0) as maakonnad_completed,
  coalesce((
    select count(*) from parish_done pd where pd.user_id = t.user_id
  ), 0) as parishes_completed,
  t.stations_contributed
from totals t
order by maakonnad_completed desc, parishes_completed desc, stations_contributed desc
limit 100;

grant select on v_discovery_leaderboard to anon, authenticated;

-- 3. Flip security_invoker on all 8 views so they respect the caller's
--    RLS on underlying tables. Safe now because every table the views
--    touch either has a public SELECT policy (prices, stations, votes,
--    parishes, maakonnad) or is accessed via a security-definer helper
--    function (user_profiles via get_display_name /
--    get_share_discovery_publicly).
alter view public.v_prices_earning         set (security_invoker = true);
alter view public.v_user_discoveries       set (security_invoker = true);
alter view public.v_user_parish_progress   set (security_invoker = true);
alter view public.v_leaderboard_7d         set (security_invoker = true);
alter view public.v_leaderboard_30d        set (security_invoker = true);
alter view public.v_leaderboard_all        set (security_invoker = true);
alter view public.v_reporters              set (security_invoker = true);
alter view public.v_discovery_leaderboard  set (security_invoker = true);
