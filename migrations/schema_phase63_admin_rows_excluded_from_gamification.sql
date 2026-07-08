-- Phase 63: keep owner "admin" price rows (phase 62) OUT of all gamification.
--
-- Admin-entered prices carry the owner's user_id, so without this they'd
-- inflate the owner's leaderboard points, discovered maakonnad/vallad, brand
-- collector and public footprint. Those rows are curated far-away/cross-border
-- data (the Latvia/Lithuania FB group), not the owner's own on-site scanning,
-- and must not count toward the owner's account. Gamification is computed at
-- READ time (these views + a client memo), so the fix is: add
-- `entry_method <> 'admin'` everywhere a user's price rows are tallied.
--
-- No trigger/counter change needed — no write-time gamification exists.
-- Views are recreated verbatim from their latest definitions (phase37/29/45/30)
-- with the filter added; security_invoker is re-asserted afterward because a
-- CREATE OR REPLACE can drop reloptions (see phase47).

-- 1. Earning tagger — feeds all three leaderboards' prices_count. Filter the
--    outer row AND both dedup self-joins so admin rows are fully invisible to
--    the earning window (can't suppress a real row's point either).
create or replace view v_prices_earning as
select
  p.id,
  p.user_id,
  p.station_id,
  p.fuel_type,
  p.price,
  p.reported_at,
  (
    not exists (
      select 1 from prices p2
      where p2.user_id = p.user_id
        and p2.station_id = p.station_id
        and p2.fuel_type = p.fuel_type
        and p2.price = p.price
        and p2.reported_at < p.reported_at
        and p2.reported_at > p.reported_at - interval '1 hour'
        and p2.entry_method <> 'admin'
    )
    and
    (
      select count(distinct p2.price) from prices p2
      where p2.user_id = p.user_id
        and p2.station_id = p.station_id
        and p2.fuel_type = p.fuel_type
        and p2.reported_at < p.reported_at
        and p2.reported_at > p.reported_at - interval '1 hour'
        and p2.entry_method <> 'admin'
    ) < 2
  ) as earns_point
from prices p
where p.user_id is not null
  and p.entry_method <> 'admin';

-- 2. Discovery source — feeds v_user_parish_progress → v_discovery_leaderboard
--    and (client-side) the self map completion. One filter cascades to all.
create or replace view v_user_discoveries as
select distinct p.user_id, p.station_id
from prices p
where p.user_id is not null
  and p.station_id is not null
  and p.entry_method <> 'admin';

-- 3. Leaderboard views — prices_count already excludes admin via
--    v_prices_earning; here we also exclude admin rows from the
--    upvotes_received channel so no admin row can earn the owner points even
--    if another user upvotes it. Bodies are otherwise verbatim from phase45.
create or replace view v_leaderboard_7d as
select
  p.user_id,
  public.get_display_name(p.user_id) as display_name,
  count(*) filter (where p.earns_point) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id and entry_method <> 'admin' and reported_at > now() - interval '7 days')
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
      and v.price_id in (select id from prices where user_id = p.user_id and entry_method <> 'admin' and reported_at > now() - interval '30 days')
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
      and v.price_id in (select id from prices where user_id = p.user_id and entry_method <> 'admin')
  ), 0) as upvotes_received
from v_prices_earning p
group by p.user_id
having count(*) filter (where p.earns_point) > 0
order by prices_count desc
limit 100;

-- 4. Public footprint RPC — exclude admin rows from another user's shared map.
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
    and p.entry_method <> 'admin'
    and up.share_discovery_publicly = true
    and coalesce(up.display_name, '') <> '';
$$;

grant execute on function public.get_user_footprint(uuid) to anon, authenticated;

-- 5. Re-assert security_invoker on every view touched (phase47 invariant).
alter view public.v_prices_earning   set (security_invoker = true);
alter view public.v_user_discoveries set (security_invoker = true);
alter view public.v_leaderboard_7d   set (security_invoker = true);
alter view public.v_leaderboard_30d  set (security_invoker = true);
alter view public.v_leaderboard_all  set (security_invoker = true);
