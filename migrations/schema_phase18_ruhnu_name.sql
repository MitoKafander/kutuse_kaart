-- Fix unbranded station on Ruhnu island that shows as "Tundmatu".
-- Sets the station name and ensures amenities.name is populated so future
-- getStationDisplayName() runs render it correctly even before next reseed.
--
-- Ruhnu sadama tankla is at the harbour (~57.7825 N, 23.2490 E). The bbox
-- below is generous (~3 km) to catch slight OSM coordinate drift.

update stations
set
  name = 'Ruhnu sadama tankla',
  amenities = coalesce(amenities, '{}'::jsonb)
              || jsonb_build_object('name', 'Ruhnu sadama tankla')
where latitude between 57.77 and 57.81
  and longitude between 23.22 and 23.28
  and (name = 'Tundmatu' or name is null);

-- Verify
select id, name, latitude, longitude, amenities
from stations
where latitude between 57.77 and 57.81
  and longitude between 23.22 and 23.28;
