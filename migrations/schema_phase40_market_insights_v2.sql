-- Phase 40: Market Insights V2 — per-fuel signals + structured data for the
-- automated "should I buy now?" drawer. See
-- /Users/mitokafander/.claude/plans/ultrathink-this-part-through-whimsical-sparkle.md
-- for the full design rationale; the short version:
--   · signal_diesel / signal_gasoline come from a deterministic algorithm
--     inside the cron Serverless Function — never from the LLM.
--   · `data` JSONB is the source of truth the drawer renders numbers from.
--   · Legacy phase 39 rows (content_et + trend only) still render via a
--     fallback path in the drawer; new columns are all nullable.

ALTER TABLE public.market_insights
  ADD COLUMN IF NOT EXISTS signal_diesel TEXT
    CHECK (signal_diesel IN ('buy_now','hold','wait','neutral')),
  ADD COLUMN IF NOT EXISTS signal_gasoline TEXT
    CHECK (signal_gasoline IN ('buy_now','hold','wait','neutral')),
  ADD COLUMN IF NOT EXISTS confidence SMALLINT
    CHECK (confidence BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS headline_et TEXT,
  ADD COLUMN IF NOT EXISTS headline_en TEXT,
  ADD COLUMN IF NOT EXISTS data JSONB,
  ADD COLUMN IF NOT EXISTS generation_version TEXT;

-- Audit trail for every cron run (success AND failure). Lets us see why the
-- drawer didn't update, and gives a pulse-object dump for post-hoc tuning of
-- the signal thresholds.
CREATE TABLE IF NOT EXISTS public.market_insight_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('success','failed_fallback','failed_skip')),
  insight_id UUID REFERENCES public.market_insights(id) ON DELETE SET NULL,
  error_message TEXT,
  pulse JSONB
);

CREATE INDEX IF NOT EXISTS idx_market_insight_runs_started_at
  ON public.market_insight_runs (started_at DESC);

ALTER TABLE public.market_insight_runs ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only (matches phase 39 convention).
