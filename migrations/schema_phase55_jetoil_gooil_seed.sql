-- Backfill 21 stations from the Jetoil network and the GoOil Tartu chain
-- that the OSM seeder (`scripts/seed_stations.js`) doesn't import — typically
-- because the OSM nodes are tagged `building`/`shop=convenience` instead of
-- `amenity=fuel`, or because the chain isn't on OSM at all. Source of truth
-- is `Notes/jetoil-tanklate-nimekiri.pdf` (PDF copy of jetoil.ee/tanklad)
-- + jetoil.ee/wp-json/wpgmza/v1/markers/ for coordinates, double-checked
-- against gooil.ee for GoOil Tartu.
--
-- Naming: each station is prefixed with its consumer-facing brand so that
-- `getBrand()` in `src/utils.ts` (CHAIN_PATTERNS substring match) lights up
-- the correct loyalty-discount, filter pill, and dot color. Existing
-- patterns already cover Jetoil / Hepa / Krooning. GoOil is a new chain;
-- the chain-pattern entry is added in the same commit (src/utils.ts).
--
-- Idempotency: `on conflict (latitude, longitude) do nothing` matches the
-- pattern phase 42 used for Saare Kütus Roomassaare. Re-running this
-- migration is safe even after the OSM seeder catches up later. The
-- amenities `source` field documents that this was a manual backfill so
-- the seeder doesn't try to overwrite name/brand on its next run.
--
-- Excluded by intent (NOT in this migration):
-- · Boat-only sadamatanklas (Heltermaa, Kuivastu, Roomassaare sadam,
--   Westmeri, Prangli) — PDF marks "ainult väikelaevadele". Not relevant
--   to drivers, would dilute Avastuskaart denominators.
-- · CNG-only stations (Paide CNG Tööstuse 15A, Kuressaare CNG Ringtee 24)
--   — Kyts doesn't track CNG fuel type today. Add when/if CNG ships.
-- · Alexela partner stations (Vesse 2, Peterburi tee 77, Sauga Täkupoiss,
--   Otepää, Valga) — already in Kyts under Alexela; Jetoil card just
--   accepts there, doesn't change ownership.

-- Tallinn / Harjumaa
INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Jetoil Betooni DP',                 59.4267,    24.86004,  'EE', 350902, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Jetoil Peetri tankla',              59.39342,   24.81853,  'EE', 352240, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Krooning Kotka-Risti',              59.54056,   25.76277,  'EE', 350346, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Krooning Padise tankla',            59.22775,   24.20565,  'EE', 7692055,'{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Lääne-Virumaa / Ida-Virumaa
INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Jetoil Ahtme R1 tankla',            59.3358,    27.40362,  'EE', 351623, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Jetoil Kiviõli R1 tankla',          59.35772,   26.96665,  'EE', 352550, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Jetoil Laekvere DP',                59.06866,   26.55328,  'EE', 350807, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Jetoil Papiaru tankla',             59.3653,    26.36031,  'EE', 352552, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Jetoil Simuna tankla',              59.05013,   26.38921,  'EE', 353600, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Hiiumaa / Läänemaa
INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Jetoil Kõrgessaare tankla',         58.98203,   22.47182,  'EE', 7821150,'{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Jetoil Uuemõisa tankla',            58.93743,   23.58205,  'EE', 7853357,'{"source": "manual: Jetoil PDF 2026-04-29; reported by 2 users via feedback 2026-04-26"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Pärnumaa
INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Jetoil Mauri Tehnoküla DP',         58.39703,   24.4461,   'EE', 7883468,'{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Jetoil Varbla sadamatankla',        58.43453,   23.6847,   'EE', 7879937,'{"source": "manual: Jetoil PDF 2026-04-29; PDF does not flag boat-only"}'::jsonb),
  ('Hepa Vändra tankla',                58.68553,   25.02513,  'EE', 7883831,'{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Raplamaa
INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Hepa Kehtna tankla',                58.92725,   24.86974,  'EE', 355043, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Hepa Laukna tankla',                58.90662,   24.17636,  'EE', 352332, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Jõgevamaa / Viljandimaa
INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Jetoil Põltsamaa tankla',           58.65733,   25.95618,  'EE', 355023, '{"source": "manual: Jetoil PDF 2026-04-29; Espak parkla, separate from Krooning Pajusi mnt"}'::jsonb),
  ('Hepa Mõisaküla tankla',             58.12466,   25.19626,  'EE', 355081, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('Krooning Võhma tankla',             58.63014,   25.55789,  'EE', 352444, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Tartumaa
INSERT INTO stations (name, latitude, longitude, country, parish_id, amenities) VALUES
  ('Jetoil Tõrvandi DP',                58.32552,   26.70732,  'EE', 354470, '{"source": "manual: Jetoil PDF 2026-04-29; OSM has no amenity=fuel here"}'::jsonb),
  ('GoOil Tartu tankla',                58.34279,   26.72062,  'EE', 351439, '{"source": "manual: gooil.ee + Jetoil PDF 2026-04-29; reported via feedback 2026-04-29"}'::jsonb)
ON CONFLICT (latitude, longitude) DO NOTHING;

-- Verify the insert: expect 21 new rows when run for the first time, 0 on
-- subsequent runs. Parish station_count is auto-bumped by the phase 29
-- recount_parish trigger; no manual count update needed.
SELECT
  count(*) FILTER (WHERE amenities->>'source' LIKE 'manual: Jetoil PDF 2026-04-29%'
                     OR  amenities->>'source' LIKE 'manual: gooil.ee%') AS phase_55_rows,
  count(*) FILTER (WHERE name LIKE 'Jetoil %') AS jetoil_rows,
  count(*) FILTER (WHERE name LIKE 'Hepa %')   AS hepa_rows,
  count(*) FILTER (WHERE name LIKE 'Krooning %') AS krooning_rows,
  count(*) FILTER (WHERE name LIKE 'GoOil %')  AS gooil_rows
FROM stations
WHERE active = true;
