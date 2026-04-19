-- Phase 39: Market Insights V1 MVP
-- Creates a table for displaying manual short messages/insights about the fuel market.

CREATE TABLE public.market_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    content_et TEXT NOT NULL,
    content_en TEXT,
    trend TEXT CHECK (trend IN ('up', 'down', 'flat')),
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- RLS: Public can read, anyone else (admin via dashboard) writes.
ALTER TABLE public.market_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view insights"
    ON public.market_insights
    FOR SELECT
    USING (true);

-- No write policies, meaning only users with 'service_role' (e.g. Supabase Dashboard or automated edge functions) can insert/update.
