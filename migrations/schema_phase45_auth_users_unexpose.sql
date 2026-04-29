-- Phase 45: close Supabase `auth_users_exposed` advisory.
--
-- Supabase's linter flagged every view in `public` that joins `auth.users`
-- and is granted to anon/authenticated. Views execute with the definer's
-- privileges, so a public view with access to `auth.users` is treated as an
-- exposure channel even when the select list only surfaces
-- `raw_user_meta_data->>'display_name'`. No active PII leak today (the
-- coalesce chain only projects the display_name), but the advisory keeps
-- firing until the `auth.users` reference is out of every public view body.
--
-- Fix: hide the `auth.users` lookup behind a security-definer helper
-- (`public.get_display_name`) and rewrite the five views to call the helper
-- instead of `left join auth.users u …`. Same lookup chain, same result
-- column — the helper just owns the privileged read.
--
-- Affected views (all `grant select … to anon, authenticated`):
--   v_leaderboard_7d, v_leaderboard_30d, v_leaderboard_all  (phase 37)
--   v_reporters                                             (phase 36)
--   v_discovery_leaderboard                                 (phase 30)
--
-- Rollback: re-apply schema_phase30_public_footprint.sql,
-- schema_phase36_reporter_names.sql, schema_phase37_points_dedup.sql in
-- that order. The helper function can be left in place (unreferenced) or
-- dropped with `drop function public.get_display_name(uuid);`.

-- 1. Security-definer display-name resolver. Mirrors the coalesce chain
--    that currently lives inline in the five views. `stable` is accurate
--    (same input → same output within a statement) and lets the planner
--    cache the call. `set search_path = public` follows the same hardening
--    pattern as `public.get_user_footprint` (phase 30).
create or replace function public.get_display_name(uid uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select display_name from public.user_profiles where id = uid),
    (select raw_user_meta_data->>'display_name' from auth.users where id = uid),
    'Anonüümne'
  );
$$;

grant execute on function public.get_display_name(uuid) to anon, authenticated;

-- 2. Rewrite v_reporters without the auth.users join.
create or replace view v_reporters as
select
  p.user_id,
  public.get_display_name(p.user_id) as display_name
from (select distinct user_id from prices where user_id is not null) p;

grant select on v_reporters to anon, authenticated;

-- 3. Rewrite the three leaderboard views. Identical shape to phase 37 —
--    just drops the `left join auth.users u`, swaps the coalesce for the
--    helper call, and removes `u.raw_user_meta_data` from GROUP BY (no
--    longer referenced). Columns, ordering, LIMIT, and HAVING unchanged so
--    `create or replace view` succeeds.

create or replace view v_leaderboard_7d as
select
  p.user_id,
  public.get_display_name(p.user_id) as display_name,
  count(*) filter (where p.earns_point) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id and reported_at > now() - interval '7 days')
      and v.created_at > now() - interval '7 days'
  ), 0) as upvotes_received
from v_prices_earning p
where p.reported_at > now() - interval '7 days'
group by p.user_id
having count(*) filter (where p.earns_point) > 0
order by prices_count desc
limit 100;

create or replace view v_leaderboard_30d as
select
  p.user_id,
  public.get_display_name(p.user_id) as display_name,
  count(*) filter (where p.earns_point) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id and reported_at > now() - interval '30 days')
      and v.created_at > now() - interval '30 days'
  ), 0) as upvotes_received
from v_prices_earning p
where p.reported_at > now() - interval '30 days'
group by p.user_id
having count(*) filter (where p.earns_point) > 0
order by prices_count desc
limit 100;

create or replace view v_leaderboard_all as
select
  p.user_id,
  public.get_display_name(p.user_id) as display_name,
  count(*) filter (where p.earns_point) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id)
  ), 0) as upvotes_received
from v_prices_earning p
group by p.user_id
having count(*) filter (where p.earns_point) > 0
order by prices_count desc
limit 100;

grant select on v_leaderboard_7d  to anon, authenticated;
grant select on v_leaderboard_30d to anon, authenticated;
grant select on v_leaderboard_all to anon, authenticated;

-- 4. Rewrite v_discovery_leaderboard. Same shape as phase 30 — column
--    list, CTEs, ordering, and LIMIT all preserved. Only the display_name
--    expression changes, so `create or replace view` works (no drop
--    needed this time — column signature is stable).
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
  coalesce(
    (select share_discovery_publicly from user_profiles where id = t.user_id),
    false
  ) as share_discovery_publicly,
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
