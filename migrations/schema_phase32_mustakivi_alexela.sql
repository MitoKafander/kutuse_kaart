-- Phase 32: Fix a mis-branded station. The Neste on Mustakivi tee (Lasnamäe,
-- Tallinn) is actually an Alexela — OSM had the wrong brand. Promote to the
-- Alexela chain so it picks up brand filter, loyalty discounts, etc.

-- Tight WHERE: Neste brand + Mustakivi street + Tallinn bbox. Should match
-- exactly one row; if it matches zero, the OSM address tag lives under a
-- different key — run the commented SELECT below to locate it manually.

update stations
set name = 'Alexela'
where name = 'Neste'
  and latitude between 59.40 and 59.46
  and longitude between 24.80 and 24.92
  and (
    amenities->>'addr:street' ilike '%Mustakivi%'
    or amenities->>'name' ilike '%Mustakivi%'
  );

-- Verify: expect exactly one Alexela row on Mustakivi tee after the update.
select id, name, latitude, longitude, amenities->>'addr:street' as street
from stations
where latitude between 59.40 and 59.46
  and longitude between 24.80 and 24.92
  and amenities->>'addr:street' ilike '%Mustakivi%';
