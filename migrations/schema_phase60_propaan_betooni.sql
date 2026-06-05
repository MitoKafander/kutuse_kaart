-- Phase 60: Add the AS Propaan Betooni autogas (LPG) station, Tallinn.
--
-- Follow-up to phase 59, which seeded the other three AS Propaan autogas
-- stations but held back Betooni 3 because it shares the lot/coordinates with
-- the "Olerex Betooni Automaattankla" already in Kyts (OSM-seeded at
-- 59.4242614, 24.8537863).
--
-- Resolved 2026-06-05: the two are commercially independent operators —
-- Olerex sells petrol/diesel there, AS Propaan runs its OWN co-located LPG
-- dispenser with its own price post + loyalty cards (not sold through Olerex,
-- per propaan.ee/autogaas). So the LPG is a Propaan price, not an Olerex one,
-- and it deserves its own station + dot rather than being mislabeled as Olerex.
--
-- Coordinate offset: placed ~25 m southwest of the Olerex dot
-- (59.4240614, 24.8534863) so the two markers are visually distinct on the
-- map instead of stacking exactly on top of each other. The offset is within
-- the same lot — well inside the 1 km price-proximity gate, so on-site price
-- reports still pass. parish_id 350902 = Tallinn.
--
-- Naming "Propaan Betooni" → getBrand() collapses it under the "Propaan"
-- brand (CHAIN_PATTERNS, added in phase 59's commit). Idempotent via
-- `on conflict (latitude, longitude) do nothing`.

INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Propaan Betooni', 59.4240614, 24.8534863, 'EE', 350902, '{"brand": "Propaan", "operator": "AS Propaan", "addr:street": "Betooni", "addr:housenumber": "3", "addr:city": "Tallinn", "fuel:lpg": "yes", "source": "manual: propaan.ee/autogaas/tanklad 2026-06-05; user-reported; co-located with Olerex Betooni (separate operator), dot offset ~25m SW to avoid overlap"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Verify: expect all four AS Propaan stations present (3 from phase 59 + this).
SELECT count(*) AS propaan_rows
FROM stations
WHERE active = true AND name LIKE 'Propaan %';
