-- Per-station structured reports from logged-in users. The four kinds cover
-- the vast majority of "this station shouldn't be on the map / is wrong":
-- abandoned (closed for good — same shape as Kuimetsa pre-phase-68c208f),
-- inaccessible (private property / fleet-only), wrong_location (marker in
-- the wrong spot), wrong_info (brand / name mismatch). Free-text `note` for
-- the long tail. Triage is manual: read v_station_report_counts in the SQL
-- editor, decide per-station whether to flip `active=false`, fix coords, or
-- update brand. NO auto-action — well-meaning users can be confidently wrong
-- and a single report shouldn't take a real station off the map.
--
-- Authed-only by design: the UNIQUE (user_id, station_id, kind) constraint
-- keeps one user from spam-clicking the same kind on the same station, and
-- requiring auth gives us a stable identity to dedup against. Anon would
-- lose both. Trade-off accepted: this gates reports behind sign-in.
--
-- RLS: insert-only for authenticated; no SELECT policy means triage runs
-- through the service-role key in the SQL editor (mirrors phase 33 feedback
-- table). The view inherits the underlying table's RLS via security_invoker
-- (phase 47 default), so the view is also service-role-only — exactly what
-- we want for an admin-only triage surface.

create table if not exists station_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  station_id  uuid not null references stations(id)   on delete cascade,
  kind        text not null check (kind in ('abandoned','inaccessible','wrong_location','wrong_info')),
  note        text check (note is null or char_length(trim(note)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  unique (user_id, station_id, kind)
);

create index if not exists idx_station_reports_station_kind on station_reports(station_id, kind);
create index if not exists idx_station_reports_created_at   on station_reports(created_at desc);

alter table station_reports enable row level security;

drop policy if exists station_reports_insert_self on station_reports;
create policy station_reports_insert_self
  on station_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

grant insert on station_reports to authenticated;

-- Triage view: per-station, per-kind aggregates with min/max timestamps so
-- the admin can sort by recency or volume. SECURITY INVOKER (phase 47
-- default) means it inherits station_reports' RLS — no public read.
create or replace view v_station_report_counts
with (security_invoker = true)
as
select
  s.id            as station_id,
  s.name          as station_name,
  s.latitude,
  s.longitude,
  s.parish_id,
  s.country,
  s.active,
  sr.kind,
  count(*)               as report_count,
  count(distinct sr.user_id) as distinct_reporters,
  min(sr.created_at)     as first_reported,
  max(sr.created_at)     as latest_reported
from stations s
join station_reports sr on sr.station_id = s.id
group by s.id, s.name, s.latitude, s.longitude, s.parish_id, s.country, s.active, sr.kind
order by report_count desc, latest_reported desc;
