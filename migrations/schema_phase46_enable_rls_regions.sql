-- Phase 46: close Supabase `rls_disabled_in_public` advisory on the
-- region-catalog tables.
--
-- Phase 29 created `public.maakonnad` and `public.parishes` with
-- `grant select … to anon, authenticated` but never issued
-- `alter table … enable row level security`. With RLS off, the grants
-- PostgREST exposes are wide open — any client holding the project's
-- anon key can INSERT/UPDATE/DELETE rows in these tables. This is a
-- live open door (not just a lint), so run this migration BEFORE
-- phase 45. Impact today: a malicious actor could wipe the region
-- catalog, which would break the Avastuskaart badge grid and the
-- Avastajad leaderboard until a reseed.
--
-- Fix: turn on RLS and add a read-only public policy. Writes continue
-- to work because:
--   - `recount_parish` trigger (phase 29) runs as the table owner and
--     bypasses RLS.
--   - Seed scripts (`scripts/parishes_seed.sql` and friends) run as
--     `service_role`, which also bypasses RLS.
-- Anon/authenticated have no legitimate write path today and none is
-- planned — the catalog is maintained admin-side.
--
-- Rollback: `alter table … disable row level security;` + drop the
-- two policies below. Only useful if the read-only policy turns out
-- to be insufficient — which would mean we need to add more policies,
-- not disable RLS.

alter table public.maakonnad enable row level security;
alter table public.parishes  enable row level security;

create policy "maakonnad public read"
  on public.maakonnad
  for select
  to anon, authenticated
  using (true);

create policy "parishes public read"
  on public.parishes
  for select
  to anon, authenticated
  using (true);
