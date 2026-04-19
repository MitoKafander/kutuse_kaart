-- Phase 42: Insert the missing Saare Kütus Roomassaare station.
--
-- OSM has Roomassaare tee 10 tagged as a building (way 213184792) rather than
-- amenity=fuel, so the Overpass seed never picks it up. saarekytus.ee lists
-- five stations; the other four (Roonimäe, Aia tänava, Pihtla tee, Orissaare)
-- are already in stations. Inserting the fifth manually lets the profile
-- Margid accordion reach 5/5 without waiting on an upstream OSM fix.
--
-- Coordinates from Nominatim reverse-geocode of way 213184792.
-- parish_id 7808958 = Saaremaa vald (see parishes_seed.sql).

insert into stations (name, latitude, longitude, amenities, country, parish_id)
values (
  'Saare Kütus',
  58.2224115,
  22.5063515,
  jsonb_build_object(
    'brand', 'Saare Kütus',
    'operator', 'Saare Kütus',
    'name', 'Roomassaare tankla',
    'addr:street', 'Roomassaare tee',
    'addr:housenumber', '10',
    'addr:city', 'Kuressaare linn',
    'addr:postcode', '93815',
    'source', 'manual: missing from OSM amenity=fuel; see saarekytus.ee'
  ),
  'EE',
  7808958
)
on conflict (latitude, longitude) do nothing;
