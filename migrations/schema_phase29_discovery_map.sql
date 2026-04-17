-- Phase 29: Avastuskaart (Discovery Map) gamification.
-- Adds Estonia's administrative regions (maakond + parish), a nullable
-- parish_id FK on stations (Latvia rows stay NULL — excluded from the game),
-- a per-user toggle, and views that power the Profile badge grid and the
-- new "Avastajad" leaderboard tab. Footprint model: any submission ever
-- counts, no staleness window.

-- 1. Admin region tables ----------------------------------------------------

create table if not exists maakonnad (
  id             smallint primary key,
  name           text not null unique,
  emoji          text,
  station_count  integer not null default 0
);

create table if not exists parishes (
  id             integer primary key,  -- OSM relation id, stable across reseeds
  maakond_id     smallint not null references maakonnad(id) on delete restrict,
  name           text not null,
  station_count  integer not null default 0
);
create index if not exists parishes_maakond_idx on parishes(maakond_id);

-- Public read on the region catalogs (used by the client to render the badge grid).
grant select on maakonnad to anon, authenticated;
grant select on parishes  to anon, authenticated;

-- 2. Station → parish FK ----------------------------------------------------

alter table stations
  add column if not exists parish_id integer references parishes(id) on delete set null;
create index if not exists stations_parish_idx on stations(parish_id)
  where parish_id is not null;

-- 3. Keep parishes.station_count honest when stations are added/removed.
-- Admin bulk reseeds should rerun the recount block from parishes_seed.sql.

create or replace function recount_parish() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.parish_id is not null then
      update parishes set station_count = station_count + 1 where id = new.parish_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.parish_id is not null then
      update parishes set station_count = greatest(station_count - 1, 0) where id = old.parish_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.parish_id is distinct from new.parish_id then
      if old.parish_id is not null then
        update parishes set station_count = greatest(station_count - 1, 0) where id = old.parish_id;
      end if;
      if new.parish_id is not null then
        update parishes set station_count = station_count + 1 where id = new.parish_id;
      end if;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists stations_recount_parish on stations;
create trigger stations_recount_parish
  after insert or update or delete on stations
  for each row execute function recount_parish();

-- 4. Per-user toggle --------------------------------------------------------

alter table user_profiles
  add column if not exists show_discovery_map boolean not null default false;

-- 5. Views powering the feature --------------------------------------------

-- All distinct (user, station) pairs the user has ever submitted a price for.
create or replace view v_user_discoveries as
select distinct p.user_id, p.station_id
from prices p
where p.user_id is not null
  and p.station_id is not null;

-- Per-user × parish progress. Only parishes with ≥1 EE station participate
-- (the Profile counter hides empty parishes from the denominator).
create or replace view v_user_parish_progress as
select
  d.user_id,
  s.parish_id,
  pa.maakond_id,
  count(distinct d.station_id) as stations_contributed,
  pa.station_count             as stations_total
from v_user_discoveries d
join stations s on s.id = d.station_id
join parishes pa on pa.id = s.parish_id
where s.parish_id is not null
  and pa.station_count > 0
group by d.user_id, s.parish_id, pa.maakond_id, pa.station_count;

-- "Avastajad" leaderboard. All-time, ranked by maakonnad completed desc,
-- parishes completed desc, stations contributed desc. Matches the shape of
-- v_leaderboard_* from phase 16 (display_name lookup chain).
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
  coalesce(
    (select display_name from user_profiles where id = t.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name,
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

grant select on v_user_discoveries       to anon, authenticated;
grant select on v_user_parish_progress   to anon, authenticated;
grant select on v_discovery_leaderboard  to anon, authenticated;
