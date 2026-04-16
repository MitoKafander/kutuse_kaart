-- Phase 28: Track submission source (camera quick-scan vs manual 500 m flow)
-- on the prices table so the two flows can be distinguished in analytics and
-- future moderation work.

-- 1. Add the column with a safe default for all existing rows (all current
--    submissions came from the camera flow).
ALTER TABLE prices ADD COLUMN IF NOT EXISTS entry_method TEXT NOT NULL DEFAULT 'camera';

-- 2. Pin the allowed values at the DB level so direct-API writes can't slip
--    garbage in. NOT VALID first for lock-free add on large tables, then
--    VALIDATE once the column is settled.
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_entry_method_valid;
ALTER TABLE prices ADD CONSTRAINT prices_entry_method_valid
  CHECK (entry_method IN ('camera', 'manual')) NOT VALID;
ALTER TABLE prices VALIDATE CONSTRAINT prices_entry_method_valid;

-- 3. Defense in depth — extend the phase22 insert policy so the RLS layer
--    also enforces the enum. Keeps the policy shape identical to phase22 so
--    existing review/audit tooling still recognises it.
DROP POLICY IF EXISTS "prices_insert_validated" ON prices;
CREATE POLICY "prices_insert_validated" ON prices
  FOR INSERT
  WITH CHECK (
    price > 0 AND price < 10
    AND fuel_type IN ('Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG')
    AND station_id IS NOT NULL
    AND entry_method IN ('camera', 'manual')
  );
