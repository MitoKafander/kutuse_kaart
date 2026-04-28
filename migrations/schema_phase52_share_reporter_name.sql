-- Phase 52: per-user privacy toggle for price-attribution display name.
-- The "Teatas: <name>" line on every price (StationDrawer fuel tiles,
-- CheapestNearbyPanel rows, RoutePlanModal results, ProfileDrawer favorites)
-- resolves names via the v_reporters view (phase 36 / phase 45 / phase 47).
-- Some users want to contribute prices without their display_name appearing
-- on every entry — this column lets them opt out. Default is true so
-- existing users see no change in behavior.
--
-- Server-side enforcement: a new security-definer helper
-- (`public.get_reporter_name`) wraps `public.get_display_name` (phase 45)
-- and returns 'Anonüümne' when the target user has share_reporter_name=false.
-- v_reporters is rewritten to call the helper. Doing the gate in a
-- security-definer function keeps the auth.uid()=id RLS on user_profiles
-- intact while still letting the view see the opt-out flag — same pattern
-- as `get_share_discovery_publicly` (phase 47).
--
-- Leaderboard views (phase 45) intentionally still call `get_display_name`
-- directly. Opting out of price attribution must NOT remove the user from
-- the leaderboard — the leaderboard is an explicit profile-surface the user
-- already chose to participate in by setting a display name.
--
-- Rollback: re-apply schema_phase45_auth_users_unexpose.sql to restore the
-- previous v_reporters body (which calls get_display_name directly), then
-- `drop function public.get_reporter_name(uuid);` and
-- `alter table user_profiles drop column share_reporter_name;`.

-- 1. Privacy column. Default true preserves the pre-phase-52 behavior for
--    every existing row.
alter table user_profiles
  add column if not exists share_reporter_name boolean not null default true;

-- 2. Security-definer reporter-name resolver. Same hardening shape as
--    `get_display_name` (phase 45) and `get_share_discovery_publicly`
--    (phase 47). Returns 'Anonüümne' when the user opted out, otherwise
--    delegates to the existing `get_display_name` chain (user_profiles →
--    auth metadata → 'Anonüümne').
create or replace function public.get_reporter_name(uid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when coalesce(
      (select share_reporter_name from public.user_profiles where id = uid),
      true
    ) then public.get_display_name(uid)
    else 'Anonüümne'
  end;
$$;

grant execute on function public.get_reporter_name(uuid) to anon, authenticated;

-- 3. Rewrite v_reporters to call the new helper. Column signature
--    (user_id, display_name) is stable so `create or replace view` works
--    without a drop. `security_invoker = true` is preserved (phase 47).
create or replace view v_reporters
with (security_invoker = true) as
select
  p.user_id,
  public.get_reporter_name(p.user_id) as display_name
from (select distinct user_id from prices where user_id is not null) p;

grant select on v_reporters to anon, authenticated;
