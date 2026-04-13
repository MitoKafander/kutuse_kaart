-- Audit: list all stations currently labeled "Tundmatu" with whatever OSM
-- tags we already have. Use this to decide which ones can be auto-renamed
-- (operator/name present) vs which need manual labels or OSM contributions.

select
  id,
  latitude,
  longitude,
  amenities->>'name'        as osm_name,
  amenities->>'operator'    as osm_operator,
  amenities->>'brand'       as osm_brand,
  amenities->>'addr:city'   as city,
  amenities->>'addr:street' as street
from stations
where name = 'Tundmatu' or name is null
order by latitude desc;

-- Auto-promote: where OSM has a name or operator, promote it to the station
-- name so the app shows something useful. Safe to run repeatedly.
update stations
set name = coalesce(amenities->>'name', amenities->>'operator')
where (name = 'Tundmatu' or name is null)
  and (amenities->>'name' is not null or amenities->>'operator' is not null);
