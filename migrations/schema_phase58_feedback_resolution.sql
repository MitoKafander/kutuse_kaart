-- Phase 58: triage state on the feedback table.
--
-- The feedback table (phase 33) had no way to mark an item handled, so
-- triage relied on remembering what had already been actioned. Add a
-- resolution marker so the open queue is a simple query.
--
--   resolved_at      NULL = still open; timestamp = handled (and when).
--   resolution_note  free-text "why/how" (fixed, already in DB, declined…).
--
-- Write access: feedback has only INSERT (self/anon) + SELECT-own policies
-- granted to `authenticated` — no UPDATE policy — so only service_role can
-- set these columns. Triage stays an admin-only action via the SQL editor
-- / service-role key, exactly like phase 54 station-report triage. No new
-- RLS needed; a signed-in user can still SELECT their own row (and would
-- just see it flagged resolved, which is harmless).

alter table feedback
  add column if not exists resolved_at     timestamptz,
  add column if not exists resolution_note text;

-- Open-queue lookups hit only unresolved rows, so a partial index keeps the
-- triage query cheap as resolved history accumulates.
create index if not exists idx_feedback_open
  on feedback (created_at desc)
  where resolved_at is null;

-- Admin triage surface: the still-open queue, newest first. security_invoker
-- (phase 47 default) means the view inherits the table's RLS, so it's
-- service-role-only — the same admin-only shape as v_station_report_counts.
drop view if exists v_open_feedback;
create view v_open_feedback
  with (security_invoker = true) as
  select id, user_id, message, user_agent, created_at
  from feedback
  where resolved_at is null
  order by created_at desc;

-- Backfill: every feedback row existing as of 2026-05-23 has been triaged.
update feedback set resolved_at = now(),
  resolution_note = 'Fixed: AdBlue/AUS32/DEF excluded from LPG slot in parse-prices prompt (commit 699edba); in-app reply sent to Dasiil.'
  where id = '6697b1a3-a754-4fa7-9db9-705fd83b112a';

update feedback set resolved_at = now(),
  resolution_note = 'Already in DB: GoOil Tartu tankla (seeded phase 55). Anonymous feedback — no in-app reply possible.'
  where id = '1ded34f1-c7a6-4695-aeba-628f08b53ccd';

update feedback set resolved_at = now(),
  resolution_note = 'Station already in DB: Uuemõisa Jetoil (phase 55 seed). Reported price NOT seeded — may be stale (policy: never seed prices from feedback). Anonymous — no reply. Duplicate of aef16f1f.'
  where id = '346dbf75-8a47-40b2-aa89-839ac82ce843';

update feedback set resolved_at = now(),
  resolution_note = 'Declined by design: Kyts does not track CNG (rare). May revisit in future. Anonymous — no reply.'
  where id = 'cfbcc162-afe9-4699-ac6e-48f3e4c6a22d';

update feedback set resolved_at = now(),
  resolution_note = 'Replied 2026-04-29 (Priit). Root cause was AI mis-bucketing of camera scans, not a positioning bug — addressed in the band-check fix.'
  where id = '3b1aef5f-3eb3-454b-817a-4b96eff28e3e';

update feedback set resolved_at = now(),
  resolution_note = 'Replied 2026-04-29 (Andrus). Uuemõisa Jetoil added via phase 55 Jetoil seed.'
  where id = 'aef16f1f-242d-4ced-a51e-cd4c5a88c91d';
