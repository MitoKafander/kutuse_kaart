-- Rehearsal test for schema_phase69_fx_rates.sql. CONTAINER ONLY.
--   docker exec -i pg-rehearsal psql -U postgres -v ON_ERROR_STOP=1 < migrations/verify_phase69_fx_rates.sql
\set QUIET on
\pset tuples_only on
begin;
create temp table r (label text, ok boolean, detail text);

create or replace function pg_temp.try(lbl text, sql text, expect text) returns void
language plpgsql as $$
declare accepted boolean := true; err text := '';
begin
  begin execute sql;
  exception when others then accepted := false; err := sqlerrm; end;
  insert into r values (lbl, (expect = 'accept') = accepted,
    case when accepted then 'accepted' else 'rejected: ' || left(err, 70) end);
end $$;

-- The guards that keep this table from being misused as a price store.
select pg_temp.try('base must be EUR',            $q$insert into fx_rates (base,quote,rate,as_of) values ('USD','SEK',10,'2026-09-25')$q$, 'reject');
select pg_temp.try('rate must be positive',       $q$insert into fx_rates (base,quote,rate,as_of) values ('EUR','SEK',0,'2026-09-25')$q$, 'reject');
select pg_temp.try('no EUR->EUR identity row',    $q$insert into fx_rates (base,quote,rate,as_of) values ('EUR','EUR',1,'2026-09-25')$q$, 'reject');
select pg_temp.try('unknown currency refused',    $q$insert into fx_rates (base,quote,rate,as_of) values ('EUR','NOK',10,'2026-09-25')$q$, 'reject');
select pg_temp.try('a real pair is accepted',     $q$insert into fx_rates (base,quote,rate,as_of) values ('EUR','SEK',11.5,'2026-09-26') on conflict (base,quote) do update set rate=11.5$q$, 'accept');

-- One row per pair, refreshed in place rather than accumulating history.
insert into r
select 'one row per pair after refresh', count(*) = 1, count(*) || ' row(s) for EUR/SEK'
from fx_rates where base='EUR' and quote='SEK';

-- Seeded so the feature works before the first cron run.
insert into r
select 'SEK seeded with a real published rate', rate between 8 and 15, 'rate=' || rate
from fx_rates where base='EUR' and quote='SEK';

-- The conversion identity the client relies on: SEK -> EUR is /rate.
insert into r
select 'SEK 17.49 -> EUR is plausible',
       round(17.49 / rate, 2) between 1.00 and 2.50,
       '17.49 SEK = ' || round(17.49 / rate, 3) || ' EUR at ' || rate
from fx_rates where base='EUR' and quote='SEK';

-- Anonymous read: the client fetches this with the publishable key.
insert into r
select 'anon can select', has_table_privilege('anon','public.fx_rates','SELECT'), 'grant present';

-- Nothing in `prices` may derive from this table.
insert into r
select 'no FK from prices to fx_rates', count(*) = 0, count(*) || ' reference(s)'
from pg_constraint where conrelid='public.prices'::regclass and contype='f'
  and confrelid='public.fx_rates'::regclass;

\pset tuples_only off
\echo ''
select case when ok then 'PASS' else 'FAIL' end as result, label, detail from r order by ok, label;
\pset tuples_only on
select case when count(*) filter (where not ok) = 0
  then format('ALL %s CHECKS PASSED', count(*))
  else format('%s of %s FAILED', count(*) filter (where not ok), count(*)) end from r;
do $$ declare n int; begin
  select count(*) into n from r where not ok;
  if n > 0 then raise exception '% check(s) failed', n; end if;
end $$;
rollback;
