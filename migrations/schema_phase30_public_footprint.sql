-- Phase 30: opt-in public Avastuskaart
--
-- Lets a user expose their contributed-station footprint on the leaderboard
-- so others can view their map. Default OFF — only users who explicitly
-- toggle "Jaga oma Avastuskaarti avalikult" in profile are exposed.

-- 1. Opt-in flag ------------------------------------------------------------
alter table user_profiles
  add column if not exists share_discovery_publicly boolean not null default false;

-- 2. Security-definer RPC: returns station ids for another user's footprint
--    ONLY if that user has opted in. Bypasses any RLS on `prices`, but is
--    strictly gated by the user's own flag so we can't leak non-opted-in data.
create or replace function public.get_user_footprint(target_user_id uuid)
returns table(station_id uuid)
language sql
security definer
set search_path = public
as $$
  select distinct p.station_id
  from prices p
  join user_profiles up on up.id = p.user_id
  where p.user_id = target_user_id
    and p.station_id is not null
    and up.share_discovery_publicly = true
    and coalesce(up.display_name, '') <> '';
$$;

grant execute on function public.get_user_footprint(uuid) to anon, authenticated;

-- 3. Expose share flag on the Avastajad leaderboard so the client can
--    conditionally render a "Vaata kaarti" action next to opted-in rows.
--    Drop first — Postgres can't reorder/rename columns via create-or-replace.
drop view if exists v_discovery_leaderboard;
create view v_discovery_leaderboard as
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
  coalesce(
    (select display_name from user_profiles where id = t.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
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
left join auth.users u on u.id = t.user_id
order by maakonnad_completed desc, parishes_completed desc, stations_contributed desc
limit 100;

grant select on v_discovery_leaderboard to anon, authenticated;
