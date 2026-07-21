-- Phase 64: make the parish recount trigger active-aware.
--
-- Bug: the phase-29 recount_parish() trigger bumps parishes.station_count on
-- INSERT/DELETE and on parish_id *moves*, but does NOTHING when a station is
-- soft-deactivated (`update stations set active = false` with parish_id
-- unchanged). Since the app only ever loads `active = true` stations
-- (App.tsx loadData) and useRegionProgress uses parishes.station_count as the
-- Avastuskaart denominator, every soft-delete left a parish stranded at
-- N-1 / N — permanently uncompletable. The manual hide_*.sql scripts worked
-- around it by re-running a full recount; ad-hoc deactivations (e.g. the
-- 2026-07-16 phantom/duplicate cleanup) did not, so Kehtna/Viljandi/Maardu
-- drifted +1.
--
-- Fix: count a station toward its parish iff (parish_id IS NOT NULL AND
-- active). The trigger now decrements the parish the row *used to* count for
-- and increments the parish it *now* counts for — which transparently handles
-- deactivation, re-activation, and parish moves in one shape. LV rows keep
-- parish_id NULL and never participate, unchanged.
--
-- security: re-declares `set search_path = public, pg_temp` because CREATE OR
-- REPLACE FUNCTION drops SET clauses added later via ALTER FUNCTION (phase 48).

create or replace function recount_parish() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Decrement the parish the OLD row counted toward, if it counted.
  if tg_op in ('UPDATE', 'DELETE') then
    if old.parish_id is not null and old.active then
      update parishes set station_count = greatest(station_count - 1, 0)
        where id = old.parish_id;
    end if;
  end if;
  -- Increment the parish the NEW row counts toward, if it counts.
  if tg_op in ('UPDATE', 'INSERT') then
    if new.parish_id is not null and new.active then
      update parishes set station_count = station_count + 1
        where id = new.parish_id;
    end if;
  end if;
  return null;
end $$;

-- Trigger definition itself is unchanged from phase 29, re-asserted for clarity.
drop trigger if exists stations_recount_parish on stations;
create trigger stations_recount_parish
  after insert or update or delete on stations
  for each row execute function recount_parish();

-- One-time reconciliation: rebuild both denormalized counts from the live
-- active set (idempotent — safe to re-run). parishes first, then maakonnad as
-- the sum of their parishes, matching parishes_seed.sql.
update parishes p
  set station_count = coalesce(
    (select count(*) from stations s
       where s.parish_id = p.id and s.country = 'EE' and s.active),
    0
  );
update maakonnad m
  set station_count = coalesce(
    (select sum(p.station_count) from parishes p where p.maakond_id = m.id),
    0
  );
