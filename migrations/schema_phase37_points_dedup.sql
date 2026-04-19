-- Phase 37: Spam-resistant leaderboard points.
-- Prices table stays fully open (no cooldown, no blocked inserts, no UX change).
-- Users can keep correcting typos and updating prices freely. The change is
-- purely in how the leaderboard views count rows toward `prices_count`.
--
-- Rule — a submission earns a point iff BOTH of these hold:
--   (a) This exact price value has NOT been submitted by this user for the
--       same (station, fuel_type) in the last 1 hour. (Kills duplicate /
--       alternating spam like 1.60 → 1.55 → 1.60 → 1.55 …)
--   (b) This user has submitted fewer than 2 distinct prices for the same
--       (station, fuel_type) in the last 1 hour. (Kills random-value spam
--       like 1.60 → 1.55 → 1.50 → 1.45 …)
--
-- Cap of 2 is deliberate: 1 initial correct report + 1 legitimate correction
-- or witnessed price change. Real fuel totems update a few times a day in
-- Estonia, not twice an hour — a user genuinely witnessing 3+ price changes
-- at the same station within 1h is implausible.
--
-- upvotes_received stays unchanged (upvotes reflect price trust, not
-- contributor effort — and per-(user,price) UNIQUE on votes already caps
-- that channel).
--
-- Caveat not addressed here: multi-account (sybil) farming. Requires
-- account-level anti-abuse (verified email/phone), tracked separately.
--
-- Rollback: re-apply schema_phase16.sql — it's a `create or replace view`
-- on all three leaderboards, so this migration is fully reversible.

-- 1. Composite index for the NOT EXISTS + count-distinct subqueries. Both
--    scope to a single (user_id, station_id, fuel_type) triple with a
--    reported_at range bounded to 1h, so this index makes each lookup
--    O(log N) instead of a seq scan. IF NOT EXISTS keeps it idempotent.
create index if not exists prices_user_station_fuel_reported_idx
  on prices (user_id, station_id, fuel_type, reported_at);

-- 2. Helper view — tags each price row with whether it earns a point.
--    Re-used by all three leaderboard views below so the rule lives in
--    exactly one place.
create or replace view v_prices_earning as
select
  p.id,
  p.user_id,
  p.station_id,
  p.fuel_type,
  p.price,
  p.reported_at,
  (
    -- Rule (a): same price from same user not seen in the last 1h.
    not exists (
      select 1 from prices p2
      where p2.user_id = p.user_id
        and p2.station_id = p.station_id
        and p2.fuel_type = p.fuel_type
        and p2.price = p.price
        and p2.reported_at < p.reported_at
        and p2.reported_at > p.reported_at - interval '1 hour'
    )
    and
    -- Rule (b): fewer than 2 distinct prior prices in the last 1h.
    (
      select count(distinct p2.price) from prices p2
      where p2.user_id = p.user_id
        and p2.station_id = p.station_id
        and p2.fuel_type = p.fuel_type
        and p2.reported_at < p.reported_at
        and p2.reported_at > p.reported_at - interval '1 hour'
    ) < 2
  ) as earns_point
from prices p
where p.user_id is not null;

-- 3. Rewrite the three leaderboard views to count only earning rows.
--    Structure mirrors phase 16 exactly — display_name coalesce chain,
--    upvotes subquery, LIMIT 100 — only `prices_count` changes from
--    `count(distinct p.id)` to `count(*) filter (where p.earns_point)`,
--    plus a HAVING clause to drop spam-only users from the ranking.

create or replace view v_leaderboard_7d as
select
  p.user_id,
  coalesce(
    (select display_name from user_profiles where id = p.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
  count(*) filter (where p.earns_point) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id and reported_at > now() - interval '7 days')
      and v.created_at > now() - interval '7 days'
  ), 0) as upvotes_received
from v_prices_earning p
left join auth.users u on u.id = p.user_id
where p.reported_at > now() - interval '7 days'
group by p.user_id, u.raw_user_meta_data
having count(*) filter (where p.earns_point) > 0
order by prices_count desc
limit 100;

create or replace view v_leaderboard_30d as
select
  p.user_id,
  coalesce(
    (select display_name from user_profiles where id = p.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
  count(*) filter (where p.earns_point) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id and reported_at > now() - interval '30 days')
      and v.created_at > now() - interval '30 days'
  ), 0) as upvotes_received
from v_prices_earning p
left join auth.users u on u.id = p.user_id
where p.reported_at > now() - interval '30 days'
group by p.user_id, u.raw_user_meta_data
having count(*) filter (where p.earns_point) > 0
order by prices_count desc
limit 100;

create or replace view v_leaderboard_all as
select
  p.user_id,
  coalesce(
    (select display_name from user_profiles where id = p.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
  count(*) filter (where p.earns_point) as prices_count,
  coalesce((
    select count(*) from votes v
    where v.vote_type = 'up'
      and v.price_id in (select id from prices where user_id = p.user_id)
  ), 0) as upvotes_received
from v_prices_earning p
left join auth.users u on u.id = p.user_id
group by p.user_id, u.raw_user_meta_data
having count(*) filter (where p.earns_point) > 0
order by prices_count desc
limit 100;

grant select on v_leaderboard_7d to anon, authenticated;
grant select on v_leaderboard_30d to anon, authenticated;
grant select on v_leaderboard_all to anon, authenticated;
