-- Phase 23: Indexes for hot query paths.
-- Addresses audit P2 #9 — until now prices/votes had no non-PK indexes, so
-- every "latest price for station", freshness cutoff, and vote aggregation
-- did a seq scan. These three cover the queries in App.loadData, the
-- leaderboard views, and per-price vote lookups in StationDrawer.
-- IF NOT EXISTS keeps this idempotent.

CREATE INDEX IF NOT EXISTS prices_station_reported_idx
  ON prices (station_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS prices_reported_at_idx
  ON prices (reported_at DESC);

CREATE INDEX IF NOT EXISTS votes_price_id_idx
  ON votes (price_id);
