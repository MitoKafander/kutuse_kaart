-- Rehearsal test for schema_phase68_currency.sql. CONTAINER ONLY — it inserts
-- and rolls back, so never point it at prod.
--
--   docker exec -i pg-rehearsal psql -U postgres -v ON_ERROR_STOP=1 < migrations/verify_phase68_currency.sql
--
-- Re-run this whenever a currency is added to price_bounds, or when phase B/C
-- touch the price guards. Every case prints PASS or FAIL; the run raises at the
-- end if anything failed, so ON_ERROR_STOP gives a non-zero exit.

\set QUIET on
\pset tuples_only on
begin;

create temp table results (label text, ok boolean, detail text);

-- Fixtures. The other three guards have to be SATISFIED, not bypassed, or an
-- "accept" case proves nothing: proximity needs submitted_lat/lon plus a real
-- station within 1 km, so each probe submits from the station's own coordinates.
-- Velocity skips anonymous rows (user_id null) and the band check needs 20
-- samples in the same country+fuel, which an empty container never has.
create temp table fixture as
with inserted as (
  insert into public.stations (name, latitude, longitude, country, active) values
    ('Rehearsal EE', 59.4370, 24.7536, 'EE', true),
    ('Rehearsal SE', 59.3293, 18.0686, 'SE', true)
  returning id, country
)
select
  (array_agg(id) filter (where country = 'EE'))[1] as ee_station,
  (array_agg(id) filter (where country = 'SE'))[1] as se_station
from inserted;

-- Try an insert and record whether it was accepted, catching only the
-- violations our guards raise.
create or replace function pg_temp.probe(p_label text, p_currency text, p_price numeric, p_expect text)
returns void language plpgsql as $$
declare
  accepted boolean := true;
  err text := '';
  st   uuid;
  lat  double precision;
  lon  double precision;
begin
  -- Judge a SEK price at a Swedish station and a EUR price at an Estonian one,
  -- so the row is coherent rather than a currency floating free of geography.
  select case when p_currency = 'SEK' then se_station else ee_station end into st from fixture;
  select latitude, longitude into lat, lon from public.stations where id = st;

  begin
    insert into public.prices (station_id, fuel_type, price, currency, entry_method, submitted_lat, submitted_lon)
    values (st, 'Diisel', p_price, p_currency, 'manual', lat, lon);
  exception when check_violation or foreign_key_violation then
    accepted := false;
    err := sqlerrm;
  end;
  insert into results values (
    p_label,
    (p_expect = 'accept') = accepted,
    case when accepted then 'accepted' else 'rejected: ' || left(err, 78) end
  );
end $$;

-- ── EUR must behave exactly as the dropped CHECK did (0.30 .. 4.00) ──────────
select pg_temp.probe('EUR 0.29  (below old CHECK)',  'EUR',  0.29, 'reject');
select pg_temp.probe('EUR 0.30  (old CHECK floor)',  'EUR',  0.30, 'accept');
select pg_temp.probe('EUR 1.789 (typical diesel)',   'EUR', 1.789, 'accept');
select pg_temp.probe('EUR 4.00  (old CHECK ceiling)','EUR',  4.00, 'accept');
select pg_temp.probe('EUR 4.01  (above old CHECK)',  'EUR',  4.01, 'reject');
select pg_temp.probe('EUR 17.49 (SEK value in EUR)', 'EUR', 17.49, 'reject');

-- ── SEK: the whole point of the phase ───────────────────────────────────────
select pg_temp.probe('SEK 4.99  (below bound)',      'SEK',  4.99, 'reject');
select pg_temp.probe('SEK 5.00  (bound floor)',      'SEK',  5.00, 'accept');
select pg_temp.probe('SEK 17.49 (typical petrol)',   'SEK', 17.49, 'accept');
select pg_temp.probe('SEK 40.00 (bound ceiling)',    'SEK', 40.00, 'accept');
select pg_temp.probe('SEK 40.01 (above bound)',      'SEK', 40.01, 'reject');

-- ── An unregistered currency must fail closed, not fall through ──────────────
select pg_temp.probe('NOK 20.00 (currency absent)',  'NOK', 20.00, 'reject');

-- ── Omitting currency must default to EUR and be judged as EUR ──────────────
do $$
declare accepted boolean := true;
begin
  begin
    insert into public.prices (station_id, fuel_type, price, entry_method, submitted_lat, submitted_lon)
    select ee_station, 'Diisel', 17.49, 'manual', s.latitude, s.longitude
    from fixture f join public.stations s on s.id = f.ee_station;
  exception when check_violation then accepted := false;
  end;
  insert into results values ('default currency is EUR (17.49 rejected)', not accepted,
    case when accepted then 'accepted — default is NOT EUR' else 'rejected as EUR' end);
end $$;

-- ── Bounds must run BEFORE the band check ───────────────────────────────────
-- Alphabetical fire order; 'trg_price_bounds' must sort first.
insert into results
select 'bounds trigger fires first',
       (array_agg(tgname order by tgname))[1] = 'trg_price_bounds',
       array_to_string(array_agg(tgname order by tgname), ' < ')
from pg_trigger where tgrelid = 'public.prices'::regclass and not tgisinternal;

-- ── The admin bypass must NOT cover bounds (phase 50 applied to the owner) ──
-- Force is_kyts_admin to true and confirm an absurd price is still refused.
create or replace function public.is_kyts_admin(uid uuid) returns boolean
  language sql immutable as $$ select true $$;
select pg_temp.probe('admin does NOT bypass bounds', 'EUR', 99.00, 'reject');

-- ── Loyalty: same brand, two currencies ─────────────────────────────────────
do $$
declare ok boolean := false; u uuid := gen_random_uuid();
begin
  begin
    alter table public.user_loyalty_discounts drop constraint if exists user_loyalty_discounts_user_id_fkey;
    insert into public.user_loyalty_discounts (user_id, brand, discount_cents, currency)
      values (u, 'Circle K', 5, 'EUR'), (u, 'Circle K', 30, 'SEK');
    ok := true;
  exception when unique_violation then ok := false;
  end;
  insert into results values ('same brand in two currencies', ok,
    case when ok then 'both rows accepted' else 'blocked by the unique key' end);
end $$;

-- ── The euro-only CHECKs are gone ───────────────────────────────────────────
insert into results
select 'old euro-only CHECKs dropped',
       count(*) = 0,
       coalesce(string_agg(conname, ', '), 'none remain')
from pg_constraint
where conrelid = 'public.prices'::regclass and contype = 'c'
  and conname in ('prices_price_sanity_bounds', 'prices_price_range');

-- ── Report ──────────────────────────────────────────────────────────────────
\pset tuples_only off
\echo ''
select case when ok then 'PASS' else 'FAIL' end as result, label, detail from results
order by ok, label;

\pset tuples_only on
select case
  when count(*) filter (where not ok) = 0
    then format('ALL %s CHECKS PASSED', count(*))
  else format('%s of %s FAILED', count(*) filter (where not ok), count(*))
end from results;

do $$
declare n int;
begin
  select count(*) into n from results where not ok;
  if n > 0 then raise exception '% rehearsal check(s) failed', n; end if;
end $$;

rollback;
