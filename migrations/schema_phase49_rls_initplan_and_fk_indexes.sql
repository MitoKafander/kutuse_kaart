-- Phase 49: close the remaining Supabase performance advisory items.
--
-- Two clusters:
--
-- (1) `auth_rls_initplan` × 11 WARN — RLS policies that call `auth.uid()`
--     bare cause Postgres to re-evaluate the function per row instead of
--     once per query. Wrapping in `(select auth.uid())` turns the call
--     into an initplan (evaluated once per statement). Zero behavior
--     change; same semantics, better plan. Supabase's docs:
--     https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--     Includes `votes_insert_scoped` which I introduced in phase 48
--     without the subselect — caught in advisor sweep.
--
-- (2) `unindexed_foreign_keys` × 4 INFO — four FK columns lack a
--     covering index: `feedback.user_id`, `market_insight_runs.insight_id`,
--     `user_favorites.station_id`, `votes.user_id`. No active impact
--     today (these tables are tiny), but a cascading delete on the
--     parent (`auth.users`, `market_insights`, `stations`, `auth.users`
--     respectively) has to seq-scan the child without an index. Cheap
--     to add before traffic grows. `user_favorites.user_id` is covered
--     by the existing `(user_id, station_id)` unique index; `votes.user_id`
--     is NOT covered by the existing `(price_id, user_id)` unique index
--     because user_id is not the leading column.
--
-- Not addressed: `unused_index` INFO on `idx_feedback_created_at`. The
-- feedback table has 1 row today — the linter flags "unused" on any
-- index that hasn't been hit yet. Keeps its value once feedback
-- accumulates and the admin dashboard sorts by recency. Leave it.
--
-- Rollback: re-apply the original policy shapes from schema_phase3.sql,
-- schema_phase8.sql, schema_phase13.sql, schema_phase33_feedback.sql,
-- and schema_phase48_tighten_rls_policies.sql; `drop index if exists`
-- on the four new indexes below.

-- --- Part 1: RLS policy rewrites --------------------------------------
-- Drop-and-recreate for each (ALTER POLICY supports USING / WITH CHECK
-- but is less predictable across branches — DROP + CREATE is explicit
-- and atomic inside a transaction).

-- user_profiles (phase 8): 3 policies
drop policy if exists "Users can view their own profile." on public.user_profiles;
create policy "Users can view their own profile."
  on public.user_profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile." on public.user_profiles;
create policy "Users can update their own profile."
  on public.user_profiles for update
  using ((select auth.uid()) = id);

drop policy if exists "Users can insert their own profile." on public.user_profiles;
create policy "Users can insert their own profile."
  on public.user_profiles for insert
  with check ((select auth.uid()) = id);

-- user_favorites (phase 8): 1 policy. ALL command — USING implicitly
-- serves as WITH CHECK when the latter is omitted.
drop policy if exists "Users can manage their own favorites." on public.user_favorites;
create policy "Users can manage their own favorites."
  on public.user_favorites for all
  using ((select auth.uid()) = user_id);

-- user_loyalty_discounts (phase 13): 4 policies
drop policy if exists "Users can read own loyalty discounts" on public.user_loyalty_discounts;
create policy "Users can read own loyalty discounts"
  on public.user_loyalty_discounts for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own loyalty discounts" on public.user_loyalty_discounts;
create policy "Users can insert own loyalty discounts"
  on public.user_loyalty_discounts for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own loyalty discounts" on public.user_loyalty_discounts;
create policy "Users can update own loyalty discounts"
  on public.user_loyalty_discounts for update
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own loyalty discounts" on public.user_loyalty_discounts;
create policy "Users can delete own loyalty discounts"
  on public.user_loyalty_discounts for delete
  using ((select auth.uid()) = user_id);

-- votes (phases 3 + 48): 2 flagged policies
drop policy if exists "Users can update their own votes." on public.votes;
create policy "Users can update their own votes."
  on public.votes for update
  using ((select auth.uid()) = user_id);

drop policy if exists "votes_insert_scoped" on public.votes;
create policy "votes_insert_scoped"
  on public.votes for insert
  with check (
    (((select auth.uid()) is null)     and user_id is null) or
    (((select auth.uid()) is not null) and user_id = (select auth.uid()))
  );

-- feedback (phase 33): 1 policy
drop policy if exists "feedback_insert_self_or_anon" on public.feedback;
create policy "feedback_insert_self_or_anon"
  on public.feedback for insert
  with check (
    (user_id is null and (select auth.uid()) is null)
    or (user_id = (select auth.uid()))
  );

-- --- Part 2: FK covering indexes --------------------------------------
-- Index naming follows each table's established convention in the repo:
-- phase 33/40 tables (feedback, market_insight_runs) use `idx_<table>_…`;
-- older tables (user_favorites, votes) use `<table>_<col>_idx`.

create index if not exists idx_feedback_user_id
  on public.feedback(user_id);

create index if not exists idx_market_insight_runs_insight_id
  on public.market_insight_runs(insight_id);

create index if not exists user_favorites_station_id_idx
  on public.user_favorites(station_id);

create index if not exists votes_user_id_idx
  on public.votes(user_id);
