-- Phase 34: Remove the ghost "Hepa" station in Kehtna alevik. OSM had two
-- separate nodes — the real tankla tagged "HEPA" (uppercase) and a ghost
-- ~20-30 m north tagged "Hepa" (title case). Keep HEPA, delete Hepa, and
-- migrate any prices/user_favorites that happen to be pinned to the ghost
-- onto the real row first so we don't lose user contributions.
--
-- The canonicalizer at src/utils.ts:148 already collapses both names to
-- the "Hepa" brand for filtering, so we leave the display name as "HEPA"
-- (that's what the user referred to as the correct station).

-- 1) Discovery — expect exactly one "HEPA" row and one "Hepa" row.
select id, name, latitude, longitude,
       amenities->>'addr:city' as city,
       amenities->>'addr:street' as street,
       (select count(*) from prices p where p.station_id = s.id) as price_count
from stations s
where name in ('HEPA', 'Hepa')
  and latitude between 58.88 and 58.96
  and longitude between 24.80 and 24.95
order by name;

-- 2) Dedupe — transactional.
begin;

-- Abort if the bbox doesn't resolve cleanly to one HEPA + one Hepa.
do $$
declare
  keep_count int;
  drop_count int;
begin
  select count(*) into keep_count from stations
  where name = 'HEPA'
    and latitude between 58.88 and 58.96
    and longitude between 24.80 and 24.95;

  select count(*) into drop_count from stations
  where name = 'Hepa'
    and latitude between 58.88 and 58.96
    and longitude between 24.80 and 24.95;

  if keep_count <> 1 or drop_count <> 1 then
    raise exception 'Phase34 abort: expected 1 HEPA + 1 Hepa in Kehtna bbox, found HEPA=% Hepa=%', keep_count, drop_count;
  end if;
end $$;

-- Pin both ids into a temp table so downstream statements share a snapshot.
create temp table hepa_dedupe as
select
  (select id from stations where name = 'HEPA'
     and latitude between 58.88 and 58.96 and longitude between 24.80 and 24.95) as keep_id,
  (select id from stations where name = 'Hepa'
     and latitude between 58.88 and 58.96 and longitude between 24.80 and 24.95) as drop_id;

-- Move prices from ghost → real.
update prices
set station_id = (select keep_id from hepa_dedupe)
where station_id = (select drop_id from hepa_dedupe);

-- Drop user_favorites on the ghost if the same user already has the real
-- row favourited (prevents unique-constraint violations on the UPDATE).
delete from user_favorites
where station_id = (select drop_id from hepa_dedupe)
  and user_id in (
    select user_id from user_favorites
    where station_id = (select keep_id from hepa_dedupe)
  );

-- Move remaining favorites.
update user_favorites
set station_id = (select keep_id from hepa_dedupe)
where station_id = (select drop_id from hepa_dedupe);

-- Delete the ghost. Votes reference prices.price_id (not stations), so
-- they ride along with the already-migrated prices.
delete from stations
where id = (select drop_id from hepa_dedupe);

drop table hepa_dedupe;

commit;

-- 3) Verify — expect exactly 1 row in the bbox.
select id, name, latitude, longitude,
       (select count(*) from prices p where p.station_id = s.id) as price_count
from stations s
where name ilike '%hepa%'
  and latitude between 58.88 and 58.96
  and longitude between 24.80 and 24.95;
