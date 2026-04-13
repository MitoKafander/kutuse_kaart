-- Phase 14: EV charging stations and prices
-- Chargers are imported from Open Charge Map (OCM) via daily cron.
-- Prices are either parsed from OCM UsageCost text or crowd-sourced like fuel.

create table if not exists ev_chargers (
  id text primary key,                 -- 'ocm:<id>' or 'osm:<id>'
  operator text,                       -- 'Enefit Volt' | 'Eleport' | 'Alexela' | ...
  name text,
  latitude double precision not null,
  longitude double precision not null,
  connectors jsonb,                    -- [{ type: 'CCS', kw: 150, count: 2 }, ...]
  max_kw numeric(6,1),
  source text not null,                -- 'ocm' | 'osm' | 'manual'
  source_url text,
  updated_at timestamptz default now()
);

create index if not exists ev_chargers_latlon_idx on ev_chargers (latitude, longitude);
create index if not exists ev_chargers_operator_idx on ev_chargers (operator);

create table if not exists ev_prices (
  id uuid primary key default gen_random_uuid(),
  charger_id text references ev_chargers(id) on delete cascade,
  connector_type text,                 -- 'AC' | 'CCS' | 'CHAdeMO' | 'Type2'
  price_per_kwh numeric(6,4) not null,
  tariff_name text,                    -- 'Public' | 'Subscriber' | etc.
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz default now(),
  source text not null                 -- 'ocm' | 'manual'
);

create index if not exists ev_prices_charger_idx on ev_prices (charger_id, reported_at desc);

-- RLS: public read, authenticated write (manual entries)
alter table ev_chargers enable row level security;
alter table ev_prices enable row level security;

drop policy if exists ev_chargers_read on ev_chargers;
create policy ev_chargers_read on ev_chargers for select using (true);

drop policy if exists ev_prices_read on ev_prices;
create policy ev_prices_read on ev_prices for select using (true);

drop policy if exists ev_prices_insert_own on ev_prices;
create policy ev_prices_insert_own on ev_prices for insert
  with check (auth.uid() = reported_by or source = 'ocm');
