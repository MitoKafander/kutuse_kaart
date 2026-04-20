-- Soft-delete flag for abandoned/closed stations. Kept as a flag instead of a
-- hard delete so (a) price/vote/favorite FKs aren't cascade-wiped and (b) the
-- OSM seeder's lat/lng upsert doesn't revive the row on its next run — the
-- seeder only sets name/latitude/longitude/amenities, so `active` is preserved
-- on conflict.
alter table stations add column if not exists active boolean not null default true;

-- Kuimetsa tankla (HEPA, Rapla maakond) — physically abandoned as of 2026-04-20.
update stations set active = false where id = '061816bf-3c26-4f66-b4f9-102c92d17adc';

-- Refresh denormalized parish/maakond counts to exclude inactive stations.
-- Discovery progress ("X/Y jaama avastatud") reads these directly.
update parishes p
  set station_count = coalesce(
    (select count(*) from stations s where s.parish_id = p.id and s.country = 'EE' and s.active),
    0
  );
update maakonnad m
  set station_count = coalesce(
    (select sum(p.station_count) from parishes p where p.maakond_id = m.id),
    0
  );
