-- Phase 65: Baltic expansion — make every country-shaped part of the schema
-- actually take a country, so Latvia and Lithuania get the same app Estonia
-- has (full station catalog + Avastuskaart + discovery leaderboard) without
-- changing a single number an Estonian user sees today.
--
-- Guiding invariant: EVERY existing row is EE, and every EE-scoped query in
-- this file reduces to its pre-phase-65 behaviour when only EE data exists.
-- Verified after apply with scripts/verify_baltic_expansion.mjs (drift = 0).
--
-- What changes and why:
--  1. `maakonnad` / `parishes` gain `country`. They were implicitly Estonian
--     (15 maakonnad, 78 vallad). LV adds its 5 statutory planning regions +
--     42 municipalities, LT its 10 apskritys + 60 savivaldybės, into the SAME
--     two tables — because
--     the whole Avastuskaart pipeline (station.parish_id -> parish ->
--     maakond -> badge grid) is already generic; only the *catalog* was EE-only.
--     Region ids stay hand-allocated and stable: EE 1-15, LV 101-105, LT 201-210.
--     parishes.id remains the OSM relation id (globally unique, so no collision).
--  2. The phase-51 price band trigger becomes country-scoped. It took the 14d
--     median across ALL prices for a fuel type; with three countries in one
--     table a foreign market's prices would both be judged against Estonian
--     medians and drag the Estonian median around. Now each country is judged
--     against its own median, and falls back to phase 50's static 0.30-4.00 €
--     CHECK while it has <20 samples (exactly the cold-start path Estonia had).
--  3. `get_kyts_fuel_window_avg` gains a defaulted `p_country` so the market
--     insight cron can run per country. Defaulted => the existing 3-arg call
--     keeps working unchanged (PostgREST resolves by named args).
--  4. `user_profiles.hidden_countries` replaces the single-purpose
--     `show_latvian_stations` boolean. The old column is KEPT (not dropped) so
--     this migration is reversible and so an old cached PWA bundle that still
--     writes it keeps working; new clients read/write the array.
--  5. The discovery views gain a country dimension, and the discovery
--     leaderboard becomes top-100 PER COUNTRY instead of top-100 overall —
--     otherwise Estonia's head start would fill every slot forever and a
--     Latvian could never appear on their own board.
--
-- Rollback: see the block at the bottom of this file.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Region catalogs gain a country
-- ─────────────────────────────────────────────────────────────────────────────

alter table maakonnad add column if not exists country text not null default 'EE';
alter table parishes  add column if not exists country text not null default 'EE';

-- maakonnad.name was globally unique (fine for 15 Estonian counties). Baltic
-- region names don't currently collide, but uniqueness per country is the
-- honest constraint and keeps a future "Riga" (city vs region) from blocking.
alter table maakonnad drop constraint if exists maakonnad_name_key;
create unique index if not exists maakonnad_country_name_key on maakonnad (country, name);

create index if not exists parishes_country_idx  on parishes (country);
create index if not exists maakonnad_country_idx on maakonnad (country);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Country-scoped price band (replaces phase 51's country-blind median)
-- ─────────────────────────────────────────────────────────────────────────────

-- Supports the median lookup below: (country, fuel_type, reported_at).
-- prices has no country of its own — it hangs off the station — so the median
-- subquery joins stations. This index is on stations; the existing
-- prices_fuel_reported_idx (phase 51) still carries the prices side.
create index if not exists stations_country_id_idx on stations (country, id);

create or replace function enforce_price_in_band()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  band_pct     constant double precision := 0.35;
  min_samples  constant integer          := 20;
  lookback     constant interval         := interval '14 days';
  row_country  text;
  fuel_median  double precision;
  fuel_n       integer;
  band_lo      double precision;
  band_hi      double precision;
begin
  -- Owner admin rows bypass the band (phase 62) — re-asserted verbatim because
  -- CREATE OR REPLACE rewrites the whole body.
  if is_kyts_admin(auth.uid()) then
    return new;
  end if;

  select s.country into row_country from stations s where s.id = new.station_id;
  if row_country is null then
    return new; -- unknown station: proximity trigger (phase 31) is the gate
  end if;

  select
    percentile_cont(0.5) within group (order by p.price),
    count(*)::int
  into fuel_median, fuel_n
  from prices p
  join stations s on s.id = p.station_id
  where p.fuel_type = new.fuel_type
    and s.country = row_country
    and p.reported_at >= now() - lookback;

  if fuel_n < min_samples or fuel_median is null or fuel_median <= 0 then
    return new;
  end if;

  band_lo := fuel_median * (1 - band_pct);
  band_hi := fuel_median * (1 + band_pct);

  if new.price < band_lo or new.price > band_hi then
    raise exception 'price % outside band for % in % (median %, expected % to %)',
      round(new.price::numeric, 3),
      new.fuel_type,
      row_country,
      round(fuel_median::numeric, 3),
      round(band_lo::numeric, 3),
      round(band_hi::numeric, 3)
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Per-country market-insight aggregate
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function get_kyts_fuel_window_avg(
  p_fuel_type text,
  p_from      timestamptz,
  p_to        timestamptz default null,
  p_country   text default 'EE'
) returns table (
  mean         numeric,
  sample_count bigint
)
language sql
stable
as $$
  select avg(p.price)::numeric as mean,
         count(*)::bigint      as sample_count
  from prices p
  join stations s on s.id = p.station_id
  where p.fuel_type = p_fuel_type
    and s.country = p_country
    and p.reported_at >= p_from
    and (p_to is null or p.reported_at < p_to);
$$;

grant execute on function get_kyts_fuel_window_avg(text, timestamptz, timestamptz, text)
  to anon, authenticated, service_role;

-- market_insights becomes one row per country per run; the app previously
-- relied on there being exactly one active row overall. The cron deactivates
-- and inserts within one country, and the index below serves the client's
-- "active rows, newest first" read.
alter table market_insights add column if not exists country text not null default 'EE';
create index if not exists market_insights_country_active_idx
  on market_insights (country, created_at desc) where is_active;

alter table market_insight_runs add column if not exists country text not null default 'EE';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Per-country station visibility (replaces show_latvian_stations)
-- ─────────────────────────────────────────────────────────────────────────────

alter table user_profiles
  add column if not exists hidden_countries text[] not null default '{}';

-- Carry the old single boolean over: anyone who had switched Latvian stations
-- off keeps them off. show_latvian_stations is left in place (rollback + old
-- cached PWA bundles still write it); new clients ignore it.
update user_profiles
   set hidden_countries = array['LV']
 where show_latvian_stations = false
   and hidden_countries = '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Discovery views gain a country dimension
-- ─────────────────────────────────────────────────────────────────────────────

-- Unchanged shape + `country`, so the client can scope the Avastuskaart to one
-- country. `pa.station_count > 0` still hides empty regions from denominators.
create or replace view v_user_parish_progress as
select
  d.user_id,
  s.parish_id,
  pa.maakond_id,
  pa.country,
  count(distinct d.station_id) as stations_contributed,
  pa.station_count             as stations_total
from v_user_discoveries d
join stations s on s.id = d.station_id
join parishes pa on pa.id = s.parish_id
where s.parish_id is not null
  and pa.station_count > 0
group by d.user_id, s.parish_id, pa.maakond_id, pa.country, pa.station_count;

-- Top 100 PER COUNTRY. A user who contributes in two countries appears on both
-- boards, each row counting only that country's regions/stations — which is
-- also what makes an Estonian's row identical to what it is today.
create or replace view v_discovery_leaderboard as
with parish_done as (
  select user_id, parish_id, maakond_id, country
  from v_user_parish_progress
  where stations_contributed >= stations_total
),
maakond_progress as (
  select
    pd.user_id,
    pd.maakond_id,
    pd.country,
    count(*) as parishes_done,
    (select count(*) from parishes p2
       where p2.maakond_id = pd.maakond_id and p2.station_count > 0) as parishes_total
  from parish_done pd
  group by pd.user_id, pd.maakond_id, pd.country
),
totals as (
  select d.user_id, s.country, count(*) as stations_contributed
  from v_user_discoveries d
  join stations s on s.id = d.station_id
  group by d.user_id, s.country
),
scored as (
  select
    t.user_id,
    t.country,
    public.get_display_name(t.user_id) as display_name,
    coalesce(
      (select share_discovery_publicly from user_profiles where id = t.user_id),
      false
    ) as share_discovery_publicly,
    coalesce((
      select count(*) from maakond_progress mp
      where mp.user_id = t.user_id
        and mp.country = t.country
        and mp.parishes_total > 0
        and mp.parishes_done >= mp.parishes_total
    ), 0) as maakonnad_completed,
    coalesce((
      select count(*) from parish_done pd
      where pd.user_id = t.user_id and pd.country = t.country
    ), 0) as parishes_completed,
    t.stations_contributed
  from totals t
)
select user_id, country, display_name, share_discovery_publicly,
       maakonnad_completed, parishes_completed, stations_contributed
from (
  select scored.*,
         row_number() over (
           partition by country
           order by maakonnad_completed desc, parishes_completed desc, stations_contributed desc
         ) as rn
  from scored
) ranked
where rn <= 100
order by country, maakonnad_completed desc, parishes_completed desc, stations_contributed desc;

grant select on v_user_parish_progress  to anon, authenticated;
grant select on v_discovery_leaderboard to anon, authenticated;

-- phase 47 invariant: CREATE OR REPLACE can drop reloptions.
alter view public.v_user_parish_progress  set (security_invoker = true);
alter view public.v_discovery_leaderboard set (security_invoker = true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Make the recount trigger maintain maakonnad too
-- ─────────────────────────────────────────────────────────────────────────────

-- Found while verifying this phase, and NOT caused by it: phase 64 taught
-- recount_parish() to keep parishes.station_count honest, but maakonnad
-- .station_count is only ever set by a manual reconcile block. Every station
-- added or deactivated since 2026-07-16 has therefore drifted it — 7 counties
-- were out by 1-5 when phase 65 was written (Harju 173 stored vs 168 actual).
--
-- Nothing in the client reads that column today (useRegionProgress sums the
-- parishes itself), so this was dormant rather than broken — but the seeds
-- below are about to add a thousand stations, and a denormalized counter that
-- only a hand-run block can fix is a trap. The trigger now maintains both
-- levels, so the reconcile in section 7 is the last one anyone has to run.

create or replace function recount_parish() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_maakond smallint;
  new_maakond smallint;
begin
  -- Decrement the parish (and its maakond) the OLD row counted toward.
  if tg_op in ('UPDATE', 'DELETE') then
    if old.parish_id is not null and old.active then
      update parishes set station_count = greatest(station_count - 1, 0)
        where id = old.parish_id
        returning maakond_id into old_maakond;
      if old_maakond is not null then
        update maakonnad set station_count = greatest(station_count - 1, 0)
          where id = old_maakond;
      end if;
    end if;
  end if;
  -- Increment the parish (and its maakond) the NEW row counts toward.
  if tg_op in ('UPDATE', 'INSERT') then
    if new.parish_id is not null and new.active then
      update parishes set station_count = station_count + 1
        where id = new.parish_id
        returning maakond_id into new_maakond;
      if new_maakond is not null then
        update maakonnad set station_count = station_count + 1
          where id = new_maakond;
      end if;
    end if;
  end if;
  return null;
end $$;

-- Trigger definition unchanged from phase 29/64, re-asserted for clarity.
drop trigger if exists stations_recount_parish on stations;
create trigger stations_recount_parish
  after insert or update or delete on stations
  for each row execute function recount_parish();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Reconcile denormalized counts across ALL countries
-- ─────────────────────────────────────────────────────────────────────────────

-- Same reconcile as phase 64 minus its `country = 'EE'` filter: the parish's
-- own country is already implied by which stations point at it. Idempotent.
update parishes p
  set station_count = coalesce(
    (select count(*) from stations s where s.parish_id = p.id and s.active),
    0
  );
update maakonnad m
  set station_count = coalesce(
    (select sum(p.station_count) from parishes p where p.maakond_id = m.id),
    0
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────────────
--   -- 1. Re-apply the phase 51 (country-blind) band function body, the phase 53
--   --    3-arg get_kyts_fuel_window_avg, and the phase 45/63 view bodies for
--   --    v_user_parish_progress + v_discovery_leaderboard.
--   -- 2. delete from stations where country in ('LV','LT');   -- drops seeded rows
--   --    (border-strip LV rows predate this phase — keep them with:
--   --     delete from stations where country = 'LT'
--   --       or (country = 'LV' and created_at > '<seed date>');)
--   -- 3. delete from parishes  where country <> 'EE';
--   --    delete from maakonnad where country <> 'EE';
--   -- 4. alter table maakonnad drop column country;
--   --    alter table parishes  drop column country;
--   --    alter table user_profiles drop column hidden_countries;
--   --    alter table market_insights drop column country;
--   --    alter table market_insight_runs drop column country;
--   -- 5. Re-apply the phase 64 recount_parish() body (parishes only) and
--   --    re-run its reconcile block.
