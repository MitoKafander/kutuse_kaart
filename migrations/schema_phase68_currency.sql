-- Phase 68: currency as a first-class fact.
--
-- Kyts has four countries and they all use the euro, so "price" has always
-- silently meant "price in EUR". Sweden is the first non-euro neighbour — and
-- every remaining one is too (SEK, NOK, DKK, PLN) — so the assumption has to
-- become explicit before any Swedish station exists.
--
-- THIS MIGRATION IS DELIBERATELY INERT. Every existing row is in a euro
-- country, the EUR bounds reproduce the CHECK they replace exactly, and no
-- client behaviour changes. That is what makes it safe to apply and verify
-- before the client-side work lands. See Notes/Plan_Local_Currency.md phase A.
--
-- Rehearsed against a container restored from `supabase db dump --linked`
-- before touching prod: this drops two CHECK constraints on the app's core
-- table, which is exactly the class of change the phase-65 rehearsal caught
-- failing halfway through.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-currency price bounds
-- ─────────────────────────────────────────────────────────────────────────────

-- Replaces the two static CHECKs on `prices`, which could only ever describe
-- one currency:
--   prices_price_sanity_bounds  CHECK (price >= 0.30 AND price <= 4.00)
--   prices_price_range          CHECK (price > 0    AND price < 10)
-- A range wide enough to admit ~17 SEK/L would also admit a euro typo of 17.00,
-- so the bound has to know which currency it is judging.
--
-- A table rather than a CASE in the trigger: adding a currency is then one
-- INSERT with no migration and no deploy. NOK/DKK/PLN are deliberately absent —
-- their pump-price ranges have not been researched, and the trigger fails
-- closed on an unknown currency, which is the honest default.
create table if not exists public.price_bounds (
  currency   text primary key,
  min_price  numeric not null,
  max_price  numeric not null,
  -- Decimal places a pump quotes in this currency: EUR fuel is 3 (1.789),
  -- SEK is 2 (17.49). The client keeps its own copy in src/constants/countries.ts
  -- for input formatting; this is the server's authority.
  decimals   smallint not null default 3,
  constraint price_bounds_sane check (min_price > 0 and max_price > min_price)
);

comment on table public.price_bounds is
  'Per-currency plausibility bounds for prices.price, enforced by enforce_price_bounds(). Add a currency with an INSERT; no migration needed.';

-- EUR reproduces phase 50 exactly, so euro submissions behave identically.
-- SEK is a deliberately wide first guess: Swedish petrol runs ~17-20 SEK/L and
-- diesel ~18-22, with E85 near 12. Tighten it once real Swedish prices exist
-- rather than guessing harder now.
insert into public.price_bounds (currency, min_price, max_price, decimals) values
  ('EUR', 0.30,  4.00, 3),
  ('SEK', 5.00, 40.00, 2)
on conflict (currency) do nothing;

alter table public.price_bounds enable row level security;

-- Public reference data: two rows, no user content. Readable by everyone so the
-- client can validate input against the same numbers the trigger enforces.
drop policy if exists price_bounds_read_all on public.price_bounds;
create policy price_bounds_read_all on public.price_bounds for select using (true);

grant select on public.price_bounds to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. prices.currency
-- ─────────────────────────────────────────────────────────────────────────────

-- Stored, not derived from stations.country. Currency changeover is real, not
-- hypothetical (Croatia 2023, Bulgaria 2026): a derived currency would silently
-- reinterpret every historical Swedish price the day Sweden joined the euro,
-- retroactively breaking medians, trends and the market signal. The column is
-- the historical fact; the country registry supplies the expected currency for
-- a NEW submission.
--
-- The default backfills every existing row, all of which are EE/LV/LT/FI.
alter table public.prices
  add column if not exists currency text not null default 'EUR'
    references public.price_bounds(currency);

comment on column public.prices.currency is
  'Currency this price was quoted in, fixed at insert time. Never rewrite it: it is what the pump said, not what the country uses today.';

create index if not exists prices_currency_idx on public.prices (currency);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The bounds trigger
-- ─────────────────────────────────────────────────────────────────────────────

-- ⚠️ NO is_kyts_admin() BYPASS, unlike the band/proximity/velocity triggers.
-- The phase-50 CHECK this replaces applied to the owner too — deliberately, so
-- that even an admin bypass row cannot be off by a factor of ten. A trigger
-- that early-returned for admins would silently widen the phase-62 bypass.
--
-- ⚠️ FAILS CLOSED. Dropping the CHECKs means an unknown or absent currency would
-- otherwise accept any value at all. The FK on prices.currency already prevents
-- that, and this raises rather than returning NEW if a row somehow slips past.
create or replace function public.enforce_price_bounds()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  b public.price_bounds;
begin
  select * into b from public.price_bounds where currency = new.currency;

  if not found then
    raise exception 'price % has unknown currency %', new.price, coalesce(new.currency, '<null>')
      using errcode = 'check_violation';
  end if;

  if new.price < b.min_price or new.price > b.max_price then
    -- Message shape mirrors enforce_price_in_band()'s so the client can parse
    -- it: see friendlyPriceSubmitError in ManualPriceModal.tsx, which matches
    -- on the literal 'outside allowed range for'.
    raise exception 'price % outside allowed range for % (expected % to %)',
      round(new.price::numeric, 3),
      new.currency,
      round(b.min_price, 2),
      round(b.max_price, 2)
      using errcode = 'check_violation';
  end if;

  return new;
end $function$;

-- Named to sort BEFORE trg_price_submit_band_check: triggers fire in
-- alphabetical order, and 'trg_price_b…' < 'trg_price_submit_b…'. Bounds must
-- run first, or an absurd value gets band-checked and the user is told their
-- price is outside the market band when the real problem is a typo'd decimal.
drop trigger if exists trg_price_bounds on public.prices;
create trigger trg_price_bounds
  before insert on public.prices
  for each row execute function public.enforce_price_bounds();

-- Now that the trigger covers the same ground per currency, the euro-only
-- CHECKs go. Order matters: the trigger exists first, so there is no window in
-- which `prices` is unguarded.
alter table public.prices drop constraint if exists prices_price_sanity_bounds;
alter table public.prices drop constraint if exists prices_price_range;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Loyalty discounts are currency-bound
-- ─────────────────────────────────────────────────────────────────────────────

-- getNetPrice() does `gross - discount_cents/100`, i.e. an ABSOLUTE subtraction.
-- A saved "Circle K -5" against a 17.49 SEK price takes off 5 öre, not 5 cents:
-- silently wrong rather than visibly broken. And Circle K, St1 and Shell all
-- trade in both euro and krona countries, so `brand` alone cannot identify
-- which discount applies — the unique key needs the currency.
alter table public.user_loyalty_discounts
  add column if not exists currency text not null default 'EUR'
    references public.price_bounds(currency);

-- Swap UNIQUE (user_id, brand) for (user_id, brand, currency) so a user can
-- hold a Circle K discount in each currency they buy fuel in.
alter table public.user_loyalty_discounts
  drop constraint if exists user_loyalty_discounts_user_id_brand_key;
alter table public.user_loyalty_discounts
  add constraint user_loyalty_discounts_user_brand_currency_key
    unique (user_id, brand, currency);

-- NOTE: the existing CHECK (discount_cents between 0 and 50) is left alone. It
-- survives SEK by coincidence — 1 SEK = 100 öre and Swedish fuel-card discounts
-- run 25-50 öre/L — but it is conceptually currency-bound. Move it into
-- price_bounds the first time a currency with a different subunit magnitude is
-- added.

-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback
-- ─────────────────────────────────────────────────────────────────────────────
--   alter table public.user_loyalty_discounts
--     drop constraint user_loyalty_discounts_user_brand_currency_key,
--     add  constraint user_loyalty_discounts_user_id_brand_key unique (user_id, brand);
--   alter table public.user_loyalty_discounts drop column currency;
--   drop trigger trg_price_bounds on public.prices;
--   drop function public.enforce_price_bounds();
--   alter table public.prices
--     add constraint prices_price_sanity_bounds check (price >= 0.30 and price <= 4.00),
--     add constraint prices_price_range        check (price > 0 and price < 10);
--   drop index prices_currency_idx;
--   alter table public.prices drop column currency;
--   drop table public.price_bounds;
--
--   Safe as long as no non-EUR price has been inserted. If one has, the two
--   CHECKs will refuse to validate and must be added NOT VALID (or the SEK rows
--   deleted first) — which is the point at which the rollback stops being free.
