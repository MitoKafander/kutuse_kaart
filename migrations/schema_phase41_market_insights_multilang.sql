-- Extend market_insights with the remaining 4 locales so the drawer text
-- renders natively in every app language (ET + EN already existed from
-- phase 40; this adds RU, FI, LV, LT).
--
-- The cron (api/generate-market-insight.ts) asks Gemini for all six
-- locales in one call. Rows written before this migration will have nulls
-- for these columns; the drawer falls back to EN, then ET.

ALTER TABLE public.market_insights
  ADD COLUMN IF NOT EXISTS headline_ru TEXT,
  ADD COLUMN IF NOT EXISTS headline_fi TEXT,
  ADD COLUMN IF NOT EXISTS headline_lv TEXT,
  ADD COLUMN IF NOT EXISTS headline_lt TEXT,
  ADD COLUMN IF NOT EXISTS content_ru  TEXT,
  ADD COLUMN IF NOT EXISTS content_fi  TEXT,
  ADD COLUMN IF NOT EXISTS content_lv  TEXT,
  ADD COLUMN IF NOT EXISTS content_lt  TEXT;
