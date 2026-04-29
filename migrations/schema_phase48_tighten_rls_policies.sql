-- Phase 48: close the three remaining Supabase Security Advisor warnings.
--
-- After phases 45/46/47 cleared every CRITICAL and ERROR, the advisor
-- surfaced three WARN-level items that are worth fixing:
--
--   (a) `rls_policy_always_true` on stations INSERT — phase 0's
--       "Anyone can insert stations (for initial seeding)." policy
--       with WITH CHECK (true). No client code inserts stations
--       (seeder runs as service_role, manual inserts like phase 32/42/44
--       are admin SQL). Policy is dead and lets anon spawn fake stations.
--
--   (b) `rls_policy_always_true` on votes INSERT — phase 9's
--       "Anyone can vote." policy with WITH CHECK (true). Lets an anon
--       client forge votes with any user_id. Client (StationDrawer.tsx)
--       only ever inserts with user_id = null (anon) or
--       user_id = auth.uid() (signed in) — tighten the policy to match.
--
--   (c) `function_search_path_mutable` on recount_parish — phase 29's
--       trigger function has no `set search_path`. Low risk, one-line
--       fix.
--
-- Not addressed here:
--   · `rls_enabled_no_policy` on market_insight_runs — INFO, intentional
--     service-role-only audit table from phase 40. Correct as-is.
--   · `auth_leaked_password_protection` — dashboard toggle, not SQL.
--
-- Rollback: re-run schema.sql's stations INSERT block for (a), re-run
-- schema_phase9.sql's votes policy for (b), and drop the search_path
-- from recount_parish via
-- `alter function public.recount_parish() reset search_path;` for (c).

-- (a) Stations INSERT: drop the legacy seeding policy. All legitimate
--     station inserts come from service_role (seed scripts + admin SQL),
--     which bypasses RLS. Anon has no reason to insert stations — the
--     app exposes no such UI.
drop policy if exists "Anyone can insert stations (for initial seeding)." on public.stations;

-- (b) Votes INSERT: replace the blanket WITH CHECK (true) with an
--     identity-bound check. Mirrors the actual client behavior in
--     src/components/StationDrawer.tsx:85-132:
--       - anon users insert { user_id: null }      → first branch
--       - authed users insert { user_id: auth.uid() } → second branch
--     Any other shape (anon forging an authed user_id, or authed user
--     inserting someone else's user_id) gets rejected by RLS.
drop policy if exists "Anyone can vote." on public.votes;
create policy "votes_insert_scoped"
  on public.votes
  for insert
  with check (
    (auth.uid() is null     and user_id is null) or
    (auth.uid() is not null and user_id = auth.uid())
  );

-- (c) recount_parish: pin search_path so the trigger can't be tricked
--     into resolving `parishes` to an attacker-controlled object earlier
--     in the search path. Matches the hardening shape already used on
--     enforce_price_submit_proximity (phase 31), get_display_name
--     (phase 45), and get_share_discovery_publicly (phase 47).
alter function public.recount_parish() set search_path = public, pg_temp;
