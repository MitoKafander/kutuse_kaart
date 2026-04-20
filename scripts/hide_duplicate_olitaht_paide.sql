-- Two Õlitäht rows exist at Paide Ruubassaare tee (~7 m apart) — OSM has both
-- a bare "Õlitäht" node and a fully-tagged one at the same forecourt. Hide the
-- bare duplicate; the tagged row (5810639a...) has the 95/98/Diisel amenity
-- tags, the address, and the 2 existing price reports.
update stations
  set active = false
  where id = '10134802-2d2e-4743-8dfa-947167408659';

-- Refresh parish/maakond counts.
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
