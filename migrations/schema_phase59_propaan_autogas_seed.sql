-- Phase 59: Seed AS Propaan autogas (LPG) filling stations.
--
-- User reported 2026-06-05 that AS Propaan autogas stations are missing from
-- Kyts. AS Propaan (propaan.ee) operates four car-fillable autogaas (LPG)
-- stations; the user confirmed all four addresses are autogas points, not
-- propane-bottle depots. Source of truth: propaan.ee/et/autogaas/tanklad/.
--
-- Coordinates from Nominatim geocode of each address; cross-checked against
-- Overpass (amenity=fuel) to confirm OSM — and therefore seed_stations.js —
-- has no node at these sites:
--   · Rapla  (Viljandi mnt 67):    no OSM fuel node within 400 m.
--   · Rakvere (Kütuse 16):         no OSM fuel node within 400 m.
--   · Jõhvi  (Tallinn-Narva 161km): nearest OSM fuel node is the Elenger
--     "Jõhvi CNG tankla" ~600 m east (CNG, not tracked by Kyts) — distinct site.
--
-- HELD BACK FOR NOW — Tallinn, Betooni 3: AS Propaan's fourth autogas point
-- shares the exact lot and coordinates (59.42426, 24.85379) with the "Olerex
-- Betooni Automaattankla" already in Kyts (seeded from OSM). The two are
-- commercially independent — Olerex sells petrol/diesel there, AS Propaan runs
-- its own co-located LPG dispenser with its own price post + loyalty cards
-- (NOT sold through Olerex). So the LPG is genuinely a Propaan price, not an
-- Olerex one. Excluded this round only to avoid a near-zero-distance duplicate
-- dot; if added later it should be a separate "Propaan Betooni" station at a
-- small coordinate offset, NOT folded into the Olerex entry. User's open call.
--
-- Naming: each station is prefixed "Propaan " so getBrand() in src/utils.ts
-- (CHAIN_PATTERNS substring match) collapses them under the new "Propaan"
-- brand added in the same commit. The 'propaan' pattern does not collide with
-- the Latvian 'propāna' (macron) pattern — they are distinct strings.
--
-- Idempotency: `on conflict (latitude, longitude) do nothing` (phase 42/55
-- precedent). The amenities `source` field documents the manual backfill so
-- the OSM seeder won't overwrite name/brand if it ever catches up. The phase
-- 29 recount trigger auto-bumps parishes.station_count on insert.

INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Propaan Rapla',   58.9985250, 24.8100335, 'EE', 351883,   '{"brand": "Propaan", "operator": "AS Propaan", "addr:street": "Viljandi mnt", "addr:housenumber": "67", "addr:city": "Rapla", "fuel:lpg": "yes", "source": "manual: propaan.ee/autogaas/tanklad 2026-06-05; user-reported; no OSM amenity=fuel here"}'::jsonb),
  ('Propaan Rakvere', 59.3555170, 26.3896650, 'EE', 352552,   '{"brand": "Propaan", "operator": "AS Propaan", "addr:street": "Kütuse", "addr:housenumber": "16", "addr:city": "Rakvere", "fuel:lpg": "yes", "source": "manual: propaan.ee/autogaas/tanklad 2026-06-05; user-reported; no OSM amenity=fuel here"}'::jsonb),
  ('Propaan Jõhvi',   59.3688545, 27.4094638, 'EE', 19894259, '{"brand": "Propaan", "operator": "AS Propaan", "addr:street": "Tallinn-Narva mnt", "addr:housenumber": "161 km", "addr:city": "Kotinuka küla", "fuel:lpg": "yes", "source": "manual: propaan.ee/autogaas/tanklad 2026-06-05; user-reported; no OSM amenity=fuel here"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Verify: expect 3 new rows on first run, 0 on re-run.
SELECT count(*) AS propaan_rows
FROM stations
WHERE active = true AND name LIKE 'Propaan %';
