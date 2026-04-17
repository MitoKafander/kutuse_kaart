-- Phase 31: Require the submitter to be within 1 km of the station they're
-- reporting prices for. Closes the station-drawer abuse vector where anyone
-- could submit prices for any station in the country with no geographic
-- constraint. Matches the client-side check in ManualPriceModal.tsx
-- (MAX_SUBMIT_KM = 1) — keep the two in sync.

-- 1. Columns for the submitter's captured GPS position. Nullable so historical
--    rows stay intact; the trigger below rejects any NEW insert that omits
--    them, so post-migration data is always populated.
ALTER TABLE prices ADD COLUMN IF NOT EXISTS submitted_lat DOUBLE PRECISION;
ALTER TABLE prices ADD COLUMN IF NOT EXISTS submitted_lon DOUBLE PRECISION;

-- 2. BEFORE INSERT trigger — uses spherical-law-of-cosines distance (ASCII
--    only, no PostGIS/earthdistance dependency, accurate to better than 10 m
--    at Estonian latitudes — more than enough for a 1 km gate).
CREATE OR REPLACE FUNCTION enforce_price_submit_proximity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_lat DOUBLE PRECISION;
  s_lon DOUBLE PRECISION;
  dist_km DOUBLE PRECISION;
BEGIN
  IF NEW.submitted_lat IS NULL OR NEW.submitted_lon IS NULL THEN
    RAISE EXCEPTION 'submitted_lat/submitted_lon required for price insert'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT latitude, longitude INTO s_lat, s_lon
  FROM stations WHERE id = NEW.station_id;

  IF s_lat IS NULL THEN
    RAISE EXCEPTION 'station % not found', NEW.station_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  dist_km := 6371 * acos(
    LEAST(1.0, GREATEST(-1.0,
      sin(radians(NEW.submitted_lat)) * sin(radians(s_lat))
      + cos(radians(NEW.submitted_lat)) * cos(radians(s_lat))
        * cos(radians(s_lon - NEW.submitted_lon))
    ))
  );

  IF dist_km > 1.0 THEN
    RAISE EXCEPTION 'submitter is %.2f km from station (max 1 km)', dist_km
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_submit_proximity ON prices;
CREATE TRIGGER trg_price_submit_proximity
  BEFORE INSERT ON prices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_price_submit_proximity();

-- 3. Defense in depth at the RLS layer. Extend phase28's policy shape so
--    direct-API writes can't bypass the NOT NULL invariant via an anon key
--    even in the unlikely case the trigger is disabled. The actual distance
--    math stays in the trigger — joins in RLS WITH CHECK get expensive.
DROP POLICY IF EXISTS "prices_insert_validated" ON prices;
CREATE POLICY "prices_insert_validated" ON prices
  FOR INSERT
  WITH CHECK (
    price > 0 AND price < 10
    AND fuel_type IN ('Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG')
    AND station_id IS NOT NULL
    AND entry_method IN ('camera', 'manual')
    AND submitted_lat IS NOT NULL
    AND submitted_lon IS NOT NULL
  );
