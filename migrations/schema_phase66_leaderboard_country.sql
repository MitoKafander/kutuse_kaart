-- Phase 66: country-scope the activity leaderboards, and stop hardcoding an
-- Estonian word as every locale's "anonymous".
--
-- Phase 65 made the DISCOVERY board per country but left the three activity
-- boards (v_leaderboard_7d / _30d / _all) global — and activity is the DEFAULT
-- tab. So a Latvian opening the leaderboard for the first time saw 100
-- Estonians and no indication why, on the one screen meant to show them their
-- own community.
--
-- Same shape as phase 65's discovery board: `country` from the station the
-- price was submitted at, and top 100 PER country rather than top 100 overall.
-- Estonia's rows are unchanged — with only EE data the window function reduces
-- to the old ordering.
--
-- `country` is appended as the LAST column on purpose: CREATE OR REPLACE VIEW
-- can only add columns at the end (phase 65 learned this the hard way, failing
-- halfway through when it tried to insert one in the middle).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Activity boards, per country
-- ─────────────────────────────────────────────────────────────────────────────

-- A user who prices in two countries appears on both boards, each row counting
-- only that country's submissions — the same rule the discovery board uses.
create or replace view v_leaderboard_7d as
with scored as (
  select
    p.user_id,
    s.country,
    count(*) filter (where p.earns_point) as prices_count,
    coalesce((
      select count(*) from votes v
      join prices pr on pr.id = v.price_id
      join stations vs on vs.id = pr.station_id
      where v.vote_type = 'up'
        and pr.user_id = p.user_id
        and pr.entry_method <> 'admin'
        and vs.country = s.country
        and pr.reported_at > now() - interval '7 days'
        and v.created_at > now() - interval '7 days'
    ), 0) as upvotes_received
  from v_prices_earning p
  join stations s on s.id = p.station_id
  where p.reported_at > now() - interval '7 days'
  group by p.user_id, s.country
  having count(*) filter (where p.earns_point) > 0
)
select user_id, display_name, prices_count, upvotes_received, country
from (
  select
    scored.user_id,
    public.get_display_name(scored.user_id) as display_name,
    scored.prices_count,
    scored.upvotes_received,
    scored.country,
    row_number() over (partition by scored.country order by scored.prices_count desc) as rn
  from scored
) ranked
where rn <= 100
order by country, prices_count desc;

create or replace view v_leaderboard_30d as
with scored as (
  select
    p.user_id,
    s.country,
    count(*) filter (where p.earns_point) as prices_count,
    coalesce((
      select count(*) from votes v
      join prices pr on pr.id = v.price_id
      join stations vs on vs.id = pr.station_id
      where v.vote_type = 'up'
        and pr.user_id = p.user_id
        and pr.entry_method <> 'admin'
        and vs.country = s.country
        and pr.reported_at > now() - interval '30 days'
        and v.created_at > now() - interval '30 days'
    ), 0) as upvotes_received
  from v_prices_earning p
  join stations s on s.id = p.station_id
  where p.reported_at > now() - interval '30 days'
  group by p.user_id, s.country
  having count(*) filter (where p.earns_point) > 0
)
select user_id, display_name, prices_count, upvotes_received, country
from (
  select
    scored.user_id,
    public.get_display_name(scored.user_id) as display_name,
    scored.prices_count,
    scored.upvotes_received,
    scored.country,
    row_number() over (partition by scored.country order by scored.prices_count desc) as rn
  from scored
) ranked
where rn <= 100
order by country, prices_count desc;

create or replace view v_leaderboard_all as
with scored as (
  select
    p.user_id,
    s.country,
    count(*) filter (where p.earns_point) as prices_count,
    coalesce((
      select count(*) from votes v
      join prices pr on pr.id = v.price_id
      join stations vs on vs.id = pr.station_id
      where v.vote_type = 'up'
        and pr.user_id = p.user_id
        and pr.entry_method <> 'admin'
        and vs.country = s.country
    ), 0) as upvotes_received
  from v_prices_earning p
  join stations s on s.id = p.station_id
  group by p.user_id, s.country
  having count(*) filter (where p.earns_point) > 0
)
select user_id, display_name, prices_count, upvotes_received, country
from (
  select
    scored.user_id,
    public.get_display_name(scored.user_id) as display_name,
    scored.prices_count,
    scored.upvotes_received,
    scored.country,
    row_number() over (partition by scored.country order by scored.prices_count desc) as rn
  from scored
) ranked
where rn <= 100
order by country, prices_count desc;

-- phase 47 invariant: CREATE OR REPLACE can drop reloptions.
alter view public.v_leaderboard_7d  set (security_invoker = true);
alter view public.v_leaderboard_30d set (security_invoker = true);
alter view public.v_leaderboard_all set (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. "Anonüümne" is not a translation
-- ─────────────────────────────────────────────────────────────────────────────

-- get_display_name returned the Estonian literal 'Anonüümne' for a user with
-- no display name, so every locale's leaderboard showed an Estonian word —
-- including Latvian and Lithuanian ones. Returning NULL lets each client fall
-- back to its own `leaderboard.anonymous` string, which already exists in all
-- six locales and is what the client reaches for when the field is empty.
--
-- Callers all coalesce on the client side; nothing depends on it being
-- non-null. Rollback: restore the phase-45 body with the literal.
-- Parameter stays named `uid`: CREATE OR REPLACE cannot rename an input
-- parameter ("cannot change name of input parameter"), and dropping the
-- function would cascade into the five views that call it.
create or replace function public.get_display_name(uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select display_name from public.user_profiles
      where id = uid and coalesce(display_name, '') <> ''),
    (select raw_user_meta_data->>'display_name' from auth.users where id = uid)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────────────
--   Re-apply the phase 63 bodies for v_leaderboard_7d/_30d/_all (global, no
--   country column) and the phase 45 body of get_display_name (which ends in
--   `, 'Anonüümne')`).
