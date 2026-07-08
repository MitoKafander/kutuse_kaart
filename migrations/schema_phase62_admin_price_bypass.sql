-- Phase 62: Owner-only ("admin") price inserts that bypass the geographic
-- and market-band submission guards.
--
-- Motivation: prices for far-away stations (e.g. the Latvia/Lithuania fuel
-- postings in the "Kütuse ja kütte hinnad Lätis, Leedus jm" Facebook group)
-- can't be entered through the normal flow — the phase31 proximity trigger
-- requires the submitter to be within 1 km, phase43 caps travel velocity, and
-- phase51 rejects anything more than ±35 % off the 14-day median. Those guards
-- are exactly right for anonymous crowd input and must stay on for everyone.
--
-- This migration carves out a single trusted identity (the app owner) that may
-- insert prices with a manually chosen station, price and timestamp, skipping
-- the three anti-abuse triggers. It does NOT relax the hard sanity CHECK
-- (0.30–4.00 €, phase50) or the fuel-type enum — a real fuel price always fits
-- those, so they still catch fat-finger typos even for the owner.
--
-- The bypass is gated on auth.uid() (the JWT of the actual caller), never on
-- the row's user_id, so a malicious client cannot attribute a forged row to
-- the owner to slip past the triggers. The owner id is hardcoded here rather
-- than stored in a self-writable column so no in-app UPDATE can grant admin.

-- 1. Owner identity check. IMMUTABLE + STABLE-safe pure comparison; returns
--    NULL for anon (auth.uid() IS NULL), which the trigger IFs treat as false.
--    3eac34e5-… = mikk.rosin@gmail.com in auth.users (email/password login).
CREATE OR REPLACE FUNCTION is_kyts_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT uid = '3eac34e5-0db4-4d64-a1e8-e5391f83db4a'::uuid;
$$;

-- 2. Allow the 'admin' entry_method alongside the existing camera/manual so
--    owner rows are filterable and auditable, and never masquerade as crowd
--    input. Re-add the enum CHECK with the widened set.
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_entry_method_valid;
ALTER TABLE prices ADD CONSTRAINT prices_entry_method_valid
  CHECK (entry_method IN ('camera', 'manual', 'admin')) NOT VALID;
ALTER TABLE prices VALIDATE CONSTRAINT prices_entry_method_valid;

-- 3. Add the admin early-return to each of the three submission-guard trigger
--    functions. Bodies are otherwise copied verbatim from phase31/43/51 — keep
--    them in sync if those phases change.

-- 3a. Proximity (phase31): bypass before the submitted_lat/lon NOT NULL check,
--     so the owner can insert without a captured GPS position at all.
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
  IF is_kyts_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

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

-- 3b. Velocity (phase43): bypass so back-to-back far-apart owner inserts don't
--     trip the 130 km/h travel-time check.
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
  IF is_kyts_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.submitted_lat IS NULL OR NEW.submitted_lon IS NULL THEN
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

-- 3c. Median band (phase51): bypass so a genuinely cheap cross-border price
--     (the whole point of the owner flow) isn't rejected for being >35 % under
--     the Estonian median.
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
  IF is_kyts_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

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

-- 4. RLS: let owner rows through without submitted_lat/lon and with the
--    'admin' method, while leaving the anonymous/crowd path byte-for-byte
--    unchanged. The owner branch binds user_id = auth.uid() so the bypass can
--    only ever be exercised by the genuinely-authenticated owner.
DROP POLICY IF EXISTS "prices_insert_validated" ON prices;
CREATE POLICY "prices_insert_validated" ON prices
  FOR INSERT
  WITH CHECK (
    price > 0 AND price < 10
    AND fuel_type IN ('Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG')
    AND station_id IS NOT NULL
    AND (
      -- Owner: full geo bypass, may use the 'admin' entry_method.
      (is_kyts_admin(auth.uid()) AND user_id = auth.uid())
      OR
      -- Everyone else: unchanged phase31 invariant.
      (entry_method IN ('camera', 'manual')
        AND submitted_lat IS NOT NULL
        AND submitted_lon IS NOT NULL)
    )
  );
