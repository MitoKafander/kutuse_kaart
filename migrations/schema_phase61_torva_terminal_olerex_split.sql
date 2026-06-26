-- Phase 61: Fix Tõrva — the single Valga 72 fuel dot was a stale OSM "Olerex"
-- tag, but that site is actually the Terminal Tõrva teenindusjaam, and Olerex
-- is a SEPARATE station on the other side of the road. User-reported on the
-- ground 2026-06-26 with a Google Maps pin for Terminal (Valga 72) and a
-- physical-pump GPS reading for Olerex (Valga 67, opposite side).
--
-- Evidence:
-- · OSM/Kyts had one node "Olerex" @ 57.9907743, 25.9399144 (addr Valga 72).
-- · Terminal's own site (terminalenergia.ee/petrol-station/torva/) lists the
--   Tõrva station at Valga 72, opened 2023-07-19; Google Maps "Terminal Tõrva
--   teenindusjaam" pin = 57.990781, 25.939952 — i.e. ~2 m from that node.
--   => the Valga 72 site is Terminal; the OSM "Olerex" tag was stale.
-- · Olerex's own current station list puts Tõrva at Valga 67, 24h, 95/D.
--   User confirms Olerex is across the road with its own totem/prices and gave
--   the physical-pump GPS 57.99165205, 25.93792934 (~150 m NW of Terminal).
--
-- (1) Rename the existing node to Terminal in place — KEEP its id + coords so
--     the 3 prices already reported against it today stay attached (they were
--     reported standing at this site = Terminal).
-- (2) Insert Olerex as a new station at the user-measured coords.

-- (1) Existing Valga 72 node -> Terminal
update stations
set name = 'Terminal',
    amenities = jsonb_build_object(
      'brand', 'Terminal',
      'operator', 'Terminal AS',
      'name', 'Terminal Tõrva teenindusjaam',
      'amenity', 'fuel',
      'addr:street', 'Valga',
      'addr:housenumber', '72',
      'addr:city', 'Tõrva',
      'opening_hours', 'Mo-Su 06:00-23:00',
      'fuel:octane_95', 'yes',
      'fuel:octane_98', 'yes',
      'fuel:diesel', 'yes',
      'source', 'manual: rebrand fix 2026-06-26 — OSM tagged this Valga 72 site "Olerex" but it is Terminal Tõrva teenindusjaam (terminalenergia.ee, opened 2023); user-confirmed via Google Maps pin'
    )
where id = 'dac99096-649d-4407-94b6-2b5f93856cd7';

-- (2) Olerex as a separate station across the road (user physical-pump GPS)
insert into stations (name, latitude, longitude, country, parish_id, amenities)
values (
  'Olerex',
  57.99165204981137,
  25.93792934250835,
  'EE',
  7819151,
  jsonb_build_object(
    'brand', 'Olerex',
    'operator', 'Olerex AS',
    'name', 'Olerex Tõrva tankla',
    'amenity', 'fuel',
    'addr:street', 'Valga',
    'addr:housenumber', '67',
    'addr:city', 'Tõrva',
    'opening_hours', '24/7',
    'fuel:octane_95', 'yes',
    'fuel:diesel', 'yes',
    'source', 'manual: user-reported physical-pump GPS 2026-06-26; Olerex on the opposite side of the road from Terminal (Valga 72). Olerex official list: Valga 67, 24h, 95/D'
  )
)
on conflict (latitude, longitude) do nothing;

-- Verify: expect Terminal + Olerex both present in Tõrva vald (parish 7819151).
-- parish/maakond station_count is auto-bumped by the phase 29 recount trigger
-- on the Olerex insert (the rename does not change counts).
select name, latitude, longitude, amenities->>'brand' as brand, active
from stations
where parish_id = 7819151
order by name;
