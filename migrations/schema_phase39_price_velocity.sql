-- Phase 39: Travel-time velocity check on price inserts. Closes the GPS
-- spoofing vector left open by phase31 — an attacker who spoofs submitted_lat/
-- submitted_lon to pass the 1 km proximity trigger can still jump between
-- stations hundreds of km apart within minutes. This trigger rejects any
-- authenticated insert whose position is unreachable from the user's most
-- recent prior submission at normal driving speed.
--
-- Rule: for each new insert by an authenticated user, find that user's most
-- recent prior insert in the last 24h. If the great-circle distance between
-- the two submitted positions exceeds 130 km/h * elapsed_hours + 2 km grace,
-- reject. 130 km/h leaves headroom for Estonian highway driving; 2 km grace
-- absorbs GPS jitter and near-simultaneous submits.
--
-- Skipped paths: anonymous inserts (user_id IS NULL — they can't farm points
-- anyway, see phase37) and first-ever submissions (no prior row in window).
-- Runs AFTER phase31's proximity trigger — both trigger names are ordered
-- alphabetically by Postgres, so trg_price_submit_proximity fires first and
-- trg_price_submit_velocity fires second.

CREATE OR REPLACE FUNCTION enforce_price_submit_velocity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_kmh    CONSTANT DOUBLE PRECISION := 130.0;
  grace_km     CONSTANT DOUBLE PRECISION := 2.0;
  lookback     CONSTANT INTERVAL         := INTERVAL '24 hours';
  prev_lat     DOUBLE PRECISION;
  prev_lon     DOUBLE PRECISION;
  prev_ts      TIMESTAMPTZ;
  now_ts       TIMESTAMPTZ := COALESCE(NEW.reported_at, now());
  dist_km      DOUBLE PRECISION;
  elapsed_h    DOUBLE PRECISION;
  max_km       DOUBLE PRECISION;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT submitted_lat, submitted_lon, reported_at
    INTO prev_lat, prev_lon, prev_ts
  FROM prices
  WHERE user_id = NEW.user_id
    AND submitted_lat IS NOT NULL
    AND submitted_lon IS NOT NULL
    AND reported_at > now_ts - lookback
    AND reported_at < now_ts
  ORDER BY reported_at DESC
  LIMIT 1;

  IF prev_lat IS NULL THEN
    RETURN NEW;
  END IF;

  dist_km := 6371 * acos(
    LEAST(1.0, GREATEST(-1.0,
      sin(radians(NEW.submitted_lat)) * sin(radians(prev_lat))
      + cos(radians(NEW.submitted_lat)) * cos(radians(prev_lat))
        * cos(radians(prev_lon - NEW.submitted_lon))
    ))
  );

  -- Floor elapsed time at 1 s so identical timestamps don't divide by zero
  -- and don't accidentally allow arbitrary distance.
  elapsed_h := GREATEST(
    EXTRACT(EPOCH FROM (now_ts - prev_ts)) / 3600.0,
    1.0 / 3600.0
  );
  max_km := v_max_kmh * elapsed_h + grace_km;

  IF dist_km > max_km THEN
    RAISE EXCEPTION 'price submission velocity exceeded: % km in % h from previous submission (max % km)',
      round(dist_km::numeric, 1), round(elapsed_h::numeric, 2), round(max_km::numeric, 1)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_submit_velocity ON prices;
CREATE TRIGGER trg_price_submit_velocity
  BEFORE INSERT ON prices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_price_submit_velocity();

-- Index note: phase37 added prices_user_station_fuel_reported_idx on
-- (user_id, station_id, fuel_type, reported_at). The leading user_id column
-- serves this trigger's WHERE user_id = ? filter, and Postgres can do a
-- backward index scan for ORDER BY reported_at DESC LIMIT 1. No new index
-- needed today. If EXPLAIN shows a seq scan under load, add:
--   CREATE INDEX prices_user_reported_idx ON prices (user_id, reported_at DESC)
--     WHERE submitted_lat IS NOT NULL;
