-- Phase 22: Enforce value + enum constraints on user-submitted prices.
-- Addresses audit P0 #2 — prior schema allowed arbitrary fuel_type strings
-- and any numeric price (incl. 0, negative, absurdly large). Anon RLS insert
-- policies were `WITH CHECK (true)`, so defense in depth: DB-level CHECKs plus
-- tighter RLS policies that require the same invariants.

-- 1. Clean any pre-existing rows that would violate the new CHECKs so the
--    ALTER TABLE doesn't fail on legacy garbage. Run the SELECTs below first
--    in the SQL editor to audit what would be removed; adjust if needed.
--    (Commented by default — uncomment only after review.)
--
-- SELECT id, station_id, fuel_type, price FROM prices
--   WHERE NOT (price > 0 AND price < 10)
--      OR fuel_type NOT IN ('Bensiin 95','Bensiin 98','Diisel','LPG');
--
-- DELETE FROM prices
--   WHERE NOT (price > 0 AND price < 10)
--      OR fuel_type NOT IN ('Bensiin 95','Bensiin 98','Diisel','LPG');

-- 2. Add CHECK constraints (NOT VALID first to avoid long locks on prod, then
--    validate). Drop-if-exists guards keep the migration idempotent.
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_price_range;
ALTER TABLE prices ADD CONSTRAINT prices_price_range
  CHECK (price > 0 AND price < 10) NOT VALID;
ALTER TABLE prices VALIDATE CONSTRAINT prices_price_range;

ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_fuel_type_valid;
ALTER TABLE prices ADD CONSTRAINT prices_fuel_type_valid
  CHECK (fuel_type IN ('Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG')) NOT VALID;
ALTER TABLE prices VALIDATE CONSTRAINT prices_fuel_type_valid;

-- 3. Tighten RLS insert policy — replace the blanket WITH CHECK (true) with
--    the same invariants so malicious clients can't bypass via direct API.
DROP POLICY IF EXISTS "Anyone can insert prices (for now)." ON prices;
DROP POLICY IF EXISTS "Anyone can insert prices." ON prices;
DROP POLICY IF EXISTS "prices_insert_validated" ON prices;
CREATE POLICY "prices_insert_validated" ON prices
  FOR INSERT
  WITH CHECK (
    price > 0 AND price < 10
    AND fuel_type IN ('Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG')
    AND station_id IS NOT NULL
  );
