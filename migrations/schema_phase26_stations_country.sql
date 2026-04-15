-- Phase 26: add country column to stations.
-- Enables mixing Estonian + border-strip Latvian stations in one table while
-- keeping the door open to promote Latvia/Lithuania into proper regions later.
-- Reversal when Latvia gets its own region: one delete by country.

alter table stations
  add column if not exists country text not null default 'EE';

create index if not exists idx_stations_country on stations (country);

-- Backfill is implicit via default 'EE'. All existing rows are Estonian.
-- Sanity check (run manually if curious):
--   select country, count(*) from stations group by country;

-- To undo the Latvia border seed later:
--   delete from stations where country = 'LV';
