-- Phase 69: FX rates, for comparison only.
--
-- Phase B of Notes/Plan_Local_Currency.md. Phase 68 made the local currency the
-- number Kyts shows; this makes cross-currency COMPARISON possible without
-- touching that.
--
-- The rule this table exists to serve, and must not be used to break:
--   A price is displayed in its own currency, always. A converted figure is a
--   secondary annotation ("17,49 kr ≈ 1,55 €") and a sort key for the two
--   deliberately cross-border screens. It is NEVER written to `prices`, never
--   replaces the pump figure, and never becomes the number a user reads first.
--
-- Without it, CheapestNearby and the route planner rank on the raw number, so a
-- Swedish station at 17.49 always sorts as more expensive than a Finnish one at
-- 1.55 regardless of what either actually costs — a wrong answer on exactly the
-- Tornio/Haparanda border that makes Sweden worth adding.
--
-- INERT until a non-euro station exists: every current price is EUR, and
-- converting EUR to EUR is a no-op that never reads this table.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The table
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per currency pair, current value only — no history. The market signal
-- keeps its own FX series for trend maths; this answers "what is this worth
-- right now", and a stale row is worse than a missing one, so `as_of` ships to
-- the client and is rendered rather than hidden.
--
-- base is always EUR because that is what the ECB publishes, and every
-- conversion triangulates through it. Enforced rather than assumed: the client's
-- converter divides by the quote rate to reach EUR and multiplies to leave it,
-- which is only correct for a EUR base.
create table if not exists public.fx_rates (
  base       text    not null default 'EUR',
  quote      text    not null references public.price_bounds(currency),
  -- 1 base = `rate` quote. EUR->SEK is 11.29, so SEK->EUR is 1/11.29.
  rate       numeric not null,
  -- The ECB's own publication date from the feed's `time` attribute, NOT the
  -- time we fetched it. The ECB publishes on TARGET business days only, so this
  -- is legitimately 1-3 days old over a weekend or holiday and the UI has to be
  -- able to say so.
  as_of      date    not null,
  updated_at timestamptz not null default now(),
  primary key (base, quote),
  constraint fx_rates_base_is_eur check (base = 'EUR'),
  constraint fx_rates_rate_positive check (rate > 0),
  -- A EUR->EUR row would be meaningless and inviting to misuse.
  constraint fx_rates_not_identity check (quote <> base)
);

comment on table public.fx_rates is
  'ECB EUR-based reference rates, refreshed by the market-insight cron. For display annotation and cross-currency ranking ONLY — never write a converted value into prices.';

-- Seeded with the real published rate so the feature works before the first
-- cron run rather than silently degrading. Refreshed twice daily thereafter.
insert into public.fx_rates (base, quote, rate, as_of) values
  ('EUR', 'SEK', 11.2900, '2026-09-25')
on conflict (base, quote) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Read access
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.fx_rates enable row level security;

-- Public reference data, a handful of rows, no user content. The client reads it
-- in the same bootstrap fan-out as price_bounds.
drop policy if exists fx_rates_read_all on public.fx_rates;
create policy fx_rates_read_all on public.fx_rates for select using (true);

grant select on public.fx_rates to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────────────
--   drop table public.fx_rates;
--
--   Free at any time: nothing references it and no stored value derives from it.
--   The client falls back to showing local currency with no annotation and, on
--   the two cross-border screens, to grouping by currency rather than ranking
--   across one — which is the honest degradation.
