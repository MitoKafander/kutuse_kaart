-- Phase 51: per-fuel sliding-band check on price inserts. Catches the
-- camera-misclassification pattern where Gemini reads the wrong fuel-type
-- label off a totem (e.g. tags a Diesel/Premium-Diesel price as LPG) but the
-- number itself is correct, so phase 50's static 0.30–4.00 €/L CHECK lets it
-- through. Today every such misread has to be cleaned up by hand.
--
-- Rule: BEFORE INSERT, look up the median price for NEW.fuel_type over the
-- last 14 days and reject if NEW.price is more than 35% off that median in
-- either direction. ±35% lets premium variants land in the same bucket as
-- regular fuel (a Pro Diisel at €2.10 is fine in a Diisel bucket whose
-- median sits at €1.91), while a Diesel-priced LPG entry at €2.03 against
-- LPG's €0.97 median is +109% off the band and gets rejected.
--
-- Bootstrap: if there are <20 samples for that fuel in the 14d window,
-- skip the check and fall back to phase 50's static CHECK alone. Avoids
-- deadlocking new fuel types or a post-wipe cold start.
--
-- Order: trigger name `trg_price_submit_band_check` sorts before
-- `trg_price_submit_proximity` (phase 31) and `trg_price_submit_velocity`
-- (phase 43) alphabetically, so this fires first. Misreads are the most
-- common rejection cause, so failing fast on them keeps the other two
-- checks out of the hot path for the common bad-scan case.
--
-- Index: phase 37 added `prices_user_station_fuel_reported_idx` on
-- (user_id, station_id, fuel_type, reported_at) — leading user_id makes it
-- useless for this trigger's `WHERE fuel_type = ? AND reported_at >= ?`
-- lookup. There is no existing fuel_type-led index, so add one.

CREATE INDEX IF NOT EXISTS prices_fuel_reported_idx
  ON prices (fuel_type, reported_at DESC);

CREATE OR REPLACE FUNCTION enforce_price_in_band()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  band_pct      CONSTANT DOUBLE PRECISION := 0.35;
  min_samples   CONSTANT INTEGER          := 20;
  lookback      CONSTANT INTERVAL         := INTERVAL '14 days';
  fuel_median   DOUBLE PRECISION;
  fuel_n        INTEGER;
  band_lo       DOUBLE PRECISION;
  band_hi       DOUBLE PRECISION;
BEGIN
  SELECT
    percentile_cont(0.5) WITHIN GROUP (ORDER BY price),
    count(*)::int
  INTO fuel_median, fuel_n
  FROM prices
  WHERE fuel_type = NEW.fuel_type
    AND reported_at >= now() - lookback;

  IF fuel_n < min_samples OR fuel_median IS NULL OR fuel_median <= 0 THEN
    RETURN NEW;
  END IF;

  band_lo := fuel_median * (1 - band_pct);
  band_hi := fuel_median * (1 + band_pct);

  IF NEW.price < band_lo OR NEW.price > band_hi THEN
    RAISE EXCEPTION 'price % outside band for % (median %, expected % to %)',
      round(NEW.price::numeric, 3),
      NEW.fuel_type,
      round(fuel_median::numeric, 3),
      round(band_lo::numeric, 3),
      round(band_hi::numeric, 3)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_submit_band_check ON prices;
CREATE TRIGGER trg_price_submit_band_check
  BEFORE INSERT ON prices
  FOR EACH ROW
  EXECUTE FUNCTION enforce_price_in_band();
