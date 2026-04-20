-- Phase 44: Insert the missing Jetoil Miiduranna station.
--
-- User reported 2026-04-20 that Jetoil at Muuli tee 27, Viimsi is not on the
-- map (friend spotted the station in person). Confirmed: Overpass returns zero
-- amenity=fuel nodes/ways within the Miiduranna bbox, and OSM has the site as
-- an unnamed building (way 26858607) so the seed_stations.js Overpass query
-- never picks it up.
--
-- Jetoil is already a known brand (see src/utils.ts brand canonicalization)
-- with other stations in OSM (Keila Põhjakaare 3, Triigi sadam, etc.) — this
-- is just the harbor site at Miiduranna that OSM never tagged as fuel.
--
-- Coordinates from Nominatim geocode of "Muuli tee 27, Viimsi" → way 26858607.
-- parish_id 350547 = Viimsi vald (see scripts/parishes_seed.sql).
-- The parishes.station_count trigger from phase 29 will bump automatically;
-- maakonnad.station_count drifts until the next batch recount (matches the
-- phase 42 precedent).

insert into stations (name, latitude, longitude, amenities, country, parish_id)
values (
  'Jetoil',
  59.5012743,
  24.8192124,
  jsonb_build_object(
    'brand', 'Jetoil',
    'operator', 'Jetoil',
    'name', 'Jetoil Miiduranna',
    'addr:street', 'Muuli tee',
    'addr:housenumber', '27',
    'addr:city', 'Miiduranna küla',
    'addr:postcode', '74015',
    'source', 'manual: missing from OSM amenity=fuel; user-reported 2026-04-20'
  ),
  'EE',
  350547
)
on conflict (latitude, longitude) do nothing;
