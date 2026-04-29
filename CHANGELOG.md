# Kyts Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - In-app feedback reply channel + Jetoil station seed + station-report flow + AI camera prompt hardening - 2026-04-29

### Added ✨
- 🟡 **Per-station report channel for logged-in users** (`migrations/schema_phase54_station_reports.sql`, `src/components/StationReportModal.tsx`, `src/components/StationDrawer.tsx`, commit `da5590a`): closes the previously-unstructured channel for "this station shouldn't be on the map / is wrong". Four-radio modal — `abandoned` (closed for good), `inaccessible` (private property / fleet-only), `wrong_location` (marker drift), `wrong_info` (brand/name) — plus a free-text 1000-char `note`. Surfaces as a subdued "Teata jaamast" link in StationDrawer's footer, hidden from anonymous users since the RLS rejects their inserts anyway. `UNIQUE (user_id, station_id, kind)` keeps one user from spam-clicking the same kind on the same station; the duplicate-INSERT path returns SQLSTATE 23505 which the modal surfaces as a friendly "already reported" success state instead of a generic error. Triage view `v_station_report_counts` aggregates per-station/per-kind report counts + first/latest timestamps for the SQL editor. **No auto-action** — every report just lands in the table; the admin manually flips `active=false` (phase 68c208f pattern) when the signal is strong enough. INSERT-only RLS for `authenticated`; no SELECT policy means triage runs as service_role only.
- 🟡 **In-app feedback reply system** (`migrations/schema_phase56_feedback_replies.sql`, `migrations/schema_phase57_feedback_self_select.sql`, `src/components/FeedbackReplyToast.tsx`, commits `22c8ee0` + `216b1c6`): replaces the missing outbound-email path. When the admin inserts a reply tied to a `feedback.id`, the recipient sees a green-bordered banner the next time they open kyts: reply text, expand-to-see-original-message button, "Sain aru" dismiss. Anonymous feedback can't receive a reply (no identity to deliver to). Phase 56 schema: `feedback_replies` (id, feedback_id FK, message, created_at, read_at), `mark_feedback_reply_read(uuid)` SECURITY DEFINER RPC for the dismiss flow (read_at is the only column the recipient can flip), `v_my_unread_feedback_replies` view that joins back to feedback for the original-message context. Dismissal is durable across reloads and devices via server-side `read_at`, plus a localStorage backstop (`kyts:dismissed-feedback-replies`) so the banner doesn't resurface even if the RPC fails (offline, transient network error, server timeout). Local-first write order: localStorage stamp → RPC → queue pop, so a tab close mid-dismiss still suppresses on this device. Phase 57 hotfix added `feedback_select_self` RLS policy on `feedback` itself — phase 33 had created `feedback` insert-only (no SELECT policy) so the EXISTS subquery in `feedback_replies` SELECT couldn't even read the user's own feedback row to confirm ownership; symptom was the toast querying `v_my_unread_feedback_replies` and getting zero rows despite the unread reply sitting in the table. Live-verified end-to-end with a test message to Mikk's account on phone — `read_at` flipped from null to timestamp ~4 minutes after dismiss tap. First real reply sent to Priit Puksoo (priit.puksoo@gmail.com) acknowledging the AI-camera fix.

### Fixed 🐛
- 🟡 **AI camera mis-bucketing fuel types into LPG slot** (`api/parse-prices.ts`, `src/components/ManualPriceModal.tsx`, commit `e7dcf2d`): Sentry KYTS-WEB-N investigation triggered by Priit's 2026-04-27 feedback ("Kui Waze ja google maps suudavad väga täpselt positsioneerida siis see programm paneb täielikult puuse ja ei anna võimalust hindu uuendada") found 8 `price_submit_failed` events in 14 days, **all SQLSTATE 23514 phase-51 band-check rejections — none proximity (phase 31).** 6/8 came from camera scans where Gemini was reading 4-row totems and dumping any unfamiliar 4th-row label (Diesel Pro, Premium D, etc.) into the **LPG slot** even though the price (€1.5–2.0) was plainly impossible for LPG (band €0.6–1.4). The phase-51 trigger correctly rejected, but rejection rolls back the whole batch — so even the correct rows for 95/98/Diisel never landed. Priit had **0 successful submissions despite ~8 attempts**: brutal new-user experience. The 1km proximity gate is fine; no widening needed. Two-pronged fix: (1) prompt now teaches Gemini the realistic ranges per fuel (LPG 0.55–1.40, Diisel 1.20–2.60, etc.) and explicitly tells it not to fill the LPG slot just because a totem has 4 rows — many totems have no LPG and a fourth row may be a premium variant or payment-method legend; (2) server-side belt-and-braces filter drops any AI price outside its fuel's range before reaching the client form, so Gemini misbucketing now silently disappears instead of becoming a user-visible rejection. New `droppedFuels` field in the API response surfaces the band-filter activity, captured in PostHog as `ai_scan_success.dropped_fuels_count` so we can measure post-fix Gemini accuracy.
- 🟡 **21 Jetoil-network stations missing from the map** (`migrations/schema_phase55_jetoil_gooil_seed.sql`, `src/utils.ts`, commit `e7dcf2d`): Andrus + 1 anonymous user reported "Uuemõisa Jetoil tankla on puudu" within 22 minutes on 2026-04-26 (two independent reporters = real station, not in OSM as `amenity=fuel`). Cross-referenced the operator's official PDF (`Notes/jetoil-tanklate-nimekiri.pdf`) against `jetoil.ee/wp-json/wpgmza/v1/markers/` and Kyts active stations within 250m: 21 missing public stations across the Jetoil family — Jetoil-branded (13), Hepa (4), Krooning (3), plus the GoOil Tartu chain (1, also in user feedback). Migration phase 55 inserts all 21 with `on conflict (latitude, longitude) do nothing` (idempotent, mirrors phase 42). Excluded from migration by intent: 5 boat-only sadamatanklas (PDF marks "ainult väikelaevadele" — Heltermaa, Kuivastu, Roomassaare sadam, Westmeri, Prangli), 2 CNG-only (Paide CNG, Kuressaare CNG — Kyts doesn't track CNG fuel type today), 5 Alexela-partner stations already tracked under Alexela. CHAIN_PATTERNS in `src/utils.ts` gets two new entries (`gooil` + `go oil`) so the new GoOil Tartu and any future GoOil expansion resolve to a stable canonical brand. Verification SELECT: 21 phase_55_rows, 16 jetoil_rows (3 pre-existing + 13 new), 4 hepa-prefixed (all new), 3 krooning-prefixed (1 pre-existing + 3 new), 1 gooil. Side effect on Avastuskaart: a few valds gain denominator (Põhja-Pärnumaa 4/4 → 4/5 etc.) — accepted, the data correction is more important than preserving any user's completion.

### Key Decisions
- **Station-reports `UNIQUE (user_id, station_id, kind)` instead of `(user_id, station_id)`**: lets one user file multiple reports against the same station for *different* kinds (e.g. flag both `inaccessible` AND `wrong_info` if both apply). Stops spam (one user, one tap-tap-tap on the same kind) without losing legitimate multi-axis reports.
- **No auto-action on station reports**: every report lands in `v_station_report_counts` for manual triage; admin decides whether to flip `active=false`, fix coords, or update brand/name. Auto-flagging risks well-meaning users taking out a real station — too high-blast-radius for a community-curated map.
- **In-app reply channel over outbound email**: Mikk doesn't want a personal Gmail-from-address signature on Kyts replies, doesn't have a provisioned `kyts@kyts.ee` mailbox, and `kyts@mikkrosin.ee` (the project mailbox set up in `82e04aa`) routes to the same personal inbox. Net cost of provisioning email outbound (Cloudflare routing, Gmail "send as", deliverability monitoring) is meaningfully higher than ~3h to build the toast. The toast also avoids any deliverability/spam-folder failure mode — if the user opens kyts, they see the reply.
- **Banner colour green (color-fresh) instead of blue (color-primary)**: the UpdateBanner uses blue for "stale bundle, please reload"; reusing the same chrome would conflate the two messages. Green signals positive admin acknowledgement and matches the existing semantic "this is a good thing" colour family.
- **`mark_feedback_reply_read` as SECURITY DEFINER RPC instead of column-level UPDATE policy**: PostgreSQL RLS doesn't restrict which columns a policy can touch — granting UPDATE on `feedback_replies` to the recipient would let them edit the message text or reset `read_at` to NULL. The RPC is ownership-checked inside the function body (`exists ... f.user_id = auth.uid()`) and only flips `read_at`; nothing else.
- **Did NOT widen the 1km proximity gate based on Priit's feedback**: his Sentry events were all band-check rejections, not proximity. The "Waze can position me but kyts can't" framing in his feedback was a wrong guess at the cause; the actual block was AI fuel-mis-bucketing, fixed via the prompt + server-side filter. Proximity gate stays at 1km.
- **GoOil pattern matches both `gooil` and `go oil`**: gooil.ee uses one-word but Jetoil's PDF spelled it "GO OIL TANKLA" with a space. The two patterns plus `normalizeBrandKey`'s case-insensitive substring match cover both spellings without needing future maintenance if a new GoOil station opens.
- **AI camera fix lives in two layers (prompt + server filter) instead of just one**: the prompt is the cheaper fix (one Gemini iteration, no validation logic), the server filter is the safety net (catches any case where Gemini ignores the new prompt). Phase 51 server trigger remains the authoritative policy enforcement; the `parse-prices` filter is bands-loose-on-purpose so legitimate edge cases (premium variants, weekend spikes) reach the form for the user to confirm.

### Open Items
- **Watch PostHog `ai_scan_success.dropped_fuels_count`**: a sustained non-zero rate means Gemini is still misbucketing despite the prompt change. If sustained ≥10% of scans, tighten the prompt further (or add an explicit "if you can't confidently identify the fuel for a given price, omit it" instruction).
- **Phase 55 backfill doesn't update `getBrand()` results for the new Jetoil-branded stations** that don't include "Jetoil" in their name — but my migration prefixes every new row with the consumer-facing brand (`Jetoil X`, `Hepa X`, `Krooning X`, `GoOil X`), so `CHAIN_PATTERNS` substring match resolves correctly without a follow-up.
- **Anonymous feedback can't receive replies**: Anonymous Uuemõisa report from 2026-04-26 19:06 has no `user_id`, so no in-app delivery is possible. Acceptable trade-off — anon feedback is intentionally low-friction; if it warrants a public ack, that's a "what's new" CHANGELOG-style channel that doesn't exist today.
- **Test data still in DB**: `feedback` rows tagged `user_agent='kyts-admin-test'` and their `feedback_replies` cascade need a one-line `DELETE FROM feedback WHERE user_agent = 'kyts-admin-test';` to clean up.
- **Reply-delivery telemetry**: consider periodically querying `feedback_replies WHERE read_at IS NULL AND created_at < now() - interval '7 days'` to flag replies that have sat unread for a week. Not built; deferred until we ship more than the 2 replies sent today.

---

## [Unreleased] - Bypass PostgREST's 1000-row response cap (Avastuskaart "lost" valds) - 2026-04-29

### Fixed 🐛
- 🔴 **Avastuskaart silently dropping completed valds the moment `prices` grew past 1000 rows** (`src/App.tsx`, commit `d84c2e7`): user reported only 1 vald (Kohila) painted complete on the map and only 1 in the profile counter, while the Avastajad leaderboard correctly showed 7 (`parishes_completed: 7`). Root cause: `loadData` fanned out `supabase.from('prices').select('*').limit(10000)` and `supabase.from('votes').select('*').limit(10000)` — but Supabase's project-level PostgREST `db-max-rows` ceiling silently truncates any single response to 1000 rows regardless of the requested limit. With `prices` at 2239 rows, the client was receiving only the latest 1000 (everything newer than 2026-04-23 05:15 UTC); for the affected user that chopped 65 distinct contributed stations down to 24, dragging Kose 2/2 → 0/2, Paide 9/9 → 0/9, Türi 4/4 → 0/4, Põhja-Pärnumaa 4/4 → 1/4, Kehtna 3/3 → 2/3, Rapla 6/6 → 4/6 — exactly matching what the user was seeing. Same code pattern on `votes` was a ticking bomb (currently 75 rows). Fix: new `fetchAllRows<T>(table, apply)` helper requests page 1 with `count: 'exact'`, then if `total > 1000` fans the remaining `.range(from, to)` requests out in parallel — so a 5,000-row table costs one extra round-trip total instead of five sequential ones. Dedupes by `id` to handle the rare race where a write lands between paginated reads (a new row at offset 0 shifts existing rows down, so the last row of page N reappears as the first row of page N+1). Both `prices` and `votes` now route through the helper. Hard 100k-row safety cap protects against runaway loops if `count` ever disagrees with reality. Side effects: every other UI driven from the `prices` array (Statistics tiles, brand collector, "biggest drops", price-history math, station price tile timestamps) was silently undercounting older data and is also now correct.
- 🟡 **Market-insight cron averages were one growth-spurt away from biasing toward whichever rows landed first in the response** (`api/generate-market-insight.ts`, `migrations/schema_phase53_kyts_fuel_window_avg.sql`, commit `d7586c8`): same PostgREST cap latent in the twice-daily cron. `fetchKytsFuelStats` was pulling raw rows with `.limit(5000)` for each fuel × window combination and averaging client-side. Per-window counts are sub-200 today (Diisel prev7 = 156 samples, verified via the new RPC), so the math is currently correct, but the moment any fuel × 2-3-day window crossed 1000 the today/prev7/prev30 means would have started skewing without warning. Fix: new `get_kyts_fuel_window_avg(p_fuel_type text, p_from timestamptz, p_to timestamptz)` RPC computes `avg(price)` + `count(*)` in Postgres with the same join (`prices ⋈ stations on s.id = p.station_id where s.country = 'EE'`) and the same half-open window semantics (`reported_at >= p_from and (p_to is null or reported_at < p_to)`). Returns one row per call regardless of table size. Cron switches from `.select(...).limit(5000)` to `sb.rpc('get_kyts_fuel_window_avg', {...})` — same window semantics, correct math regardless of table size. Function is `LANGUAGE SQL STABLE` (read-only, single-statement, planner can inline). `EXECUTE` granted to `anon, authenticated, service_role`; the cron uses the service-role key but keeping anon/auth grants leaves the door open for future read-only client uses.

### Key Decisions
- **Paginate the bulk fetch instead of moving discovery to the server view**: the obvious alternative was to compute `completedParishIds` from `v_user_parish_progress` directly (which already aggregates correctly server-side and is what the leaderboard reads). That fixes Avastuskaart specifically, but the same 1000-row truncation was silently affecting Statistics, brand collector, station tile timestamps, and "biggest drops" — anything driven from the global `prices` array. Pagination is the broader fix and keeps the existing client-side data flow intact (no hook signature changes, no new query path for celebration-toast logic to thread through). The `useRegionProgress` hook computes correctly when given the full data.
- **`count: 'exact'` on page 1 + parallel `.range()` for pages 2+ instead of sequential pagination**: for a table that fits in one page (the common case after deploy, since most users won't have 1000+ rows of *anything*) the helper short-circuits with zero extra cost. For tables that need paging, `count` lets us know upfront how many parallel requests to fire, which on Slow 4G saves N-1 round-trips vs sequential `while(more)` paging. The `count: 'exact'` flag rides along in the same first request via `Content-Range` header — no separate HEAD round-trip.
- **Dedupe by `id` instead of `range` math gymnastics**: theoretically you can avoid the race by snapshotting `count` and using SERIALIZABLE-style guarantees, but PostgREST has neither. A `Set<id>` adds ~O(N) memory for the dedup table, compared to a much rarer correctness bug under concurrent writes. The app's write rate is low (single-digit prices/minute peak), so the race window is sub-millisecond — but the dedup is ~10 lines of code and worth the insurance.
- **Hard 100k safety cap in `fetchAllRows`**: if `count` ever returns a wildly wrong number (e.g., a future Postgres view that estimates instead of exact-counts), the helper would otherwise fire an unbounded number of `.range()` requests. 100k rows is well past anything we'd realistically want to ship to a phone anyway — at that scale the right answer is server-side aggregation, not pagination.
- **Stable ORDER BY `reported_at DESC, id DESC` for prices pagination**: `reported_at` alone isn't a tiebreaker (multiple rows can share a timestamp at sub-ms precision), and PostgREST's pagination is order-sensitive. Adding `id DESC` as a secondary sort makes the pagination deterministic without changing the semantic ordering downstream consumers expect (latest first).
- **Pushed market-insight aggregation into SQL via RPC instead of paginating the fetch**: the cron only needs one number (mean + count) per call, so pulling thousands of rows just to `.reduce` them client-side was always wasteful. SQL aggregate is the structurally correct fix — the function does in 1 row what the row-pulling code did in up to 5000 rows. Pagination would have fixed the cap but kept the over-fetching.
- **`STABLE` not `IMMUTABLE` on the RPC**: reads `prices` + `stations` which are both mutable tables. `STABLE` lets the planner cache the result within a single statement (sufficient for our use) without falsely promising the result is fixed forever.
- **Did not move the `useRegionProgress` hook to read from `v_user_parish_progress` directly**: would be slightly more efficient (server pre-aggregates, less data over the wire) but breaks the celebration-toast flow which depends on `contributedStationIds: Set<string>` to fire "new station discovered" toasts on submission. Pagination keeps that flow intact.

### Open Items
- **Smoke test on prod**: refresh kyts.ee after Vercel deploys (commits `d84c2e7` + `d7586c8`). Open Profile → Avastuskaart — counters should read 65/N stations · 7/N valdasid · 0/15 maakonnad. Map should paint 7 valds green when zoomed in / focused on each maakond: Kose, Paide linn, Türi, Põhja-Pärnumaa, Kehtna, Kohila, Rapla.
- **Migration applied 2026-04-29** (verified): `get_kyts_fuel_window_avg('Diisel', now() - '9 days', now() - '6 days')` returned `mean=1.827, sample_count=156`. Next cron firing (06:00 or 15:00 UTC) exercises the new RPC path; watch `market_insight_runs.status` for the next 1-2 firings to confirm.
- **Not addressed in this pass**: the same `db-max-rows` cap also affects any future Supabase MCP read or any new client query that crosses 1k rows. The `fetchAllRows` helper is App.tsx-local — if other modules grow bulk reads later, lift it into a shared utility (e.g. `src/utils/fetchAllRows.ts`).

---

## [Unreleased] - RLS initplan optimization + FK covering indexes - 2026-04-23

### Performance ⚡
- 🟡 **`auth_rls_initplan` × 11 WARN** (`migrations/schema_phase49_rls_initplan_and_fk_indexes.sql`): Every RLS policy that referenced `auth.uid()` bare was re-evaluating the function per row. Rewrote all 11 to use `(select auth.uid())`, which turns the call into an initplan evaluated once per query. Zero semantic change — same policies, same semantics, better plan. Affects `user_profiles` (view / update / insert), `user_favorites` (manage), `user_loyalty_discounts` (read / insert / update / delete), `votes` (`Users can update their own votes.` + `votes_insert_scoped`), `feedback` (`feedback_insert_self_or_anon`). Includes one I introduced in phase 48 (`votes_insert_scoped`) — caught in the sweep; fixed alongside the rest. Scale impact is small today (user-owned tables are 0–21 rows) but becomes material as `votes` grows (currently 68, ~5-10/day).
- 🟢 **`unindexed_foreign_keys` × 4 INFO** (same migration): Added covering indexes for four FK columns — `feedback.user_id`, `market_insight_runs.insight_id`, `user_favorites.station_id`, `votes.user_id`. No active impact today (tables are tiny) but a cascading delete on the parent (`auth.users`, `market_insights`, `stations`, `auth.users` respectively) would seq-scan the child without an index. Index naming follows each table's established convention: phase 33/40 tables use `idx_<table>_…`; older tables use `<table>_<col>_idx`. Note: the linter didn't flag `user_favorites.user_id` because the existing unique `(user_id, station_id)` index already covers it — it would have if that index had a different leading column.

### Key Decisions
- **Drop + recreate each policy, not `alter policy`**: `alter policy … using … with check …` works in modern Postgres but has subtle edge cases around preserving role lists and implicit WITH-CHECK-defaults-to-USING behavior for `ALL` commands. Drop + create is explicit and atomic inside the migration's transaction; makes the diff reviewable without ambiguity about what changed.
- **Preserved the existing OR structure in `votes_insert_scoped` and `feedback_insert_self_or_anon` instead of collapsing to `IS NOT DISTINCT FROM`**: semantically `(NULL-NULL OR X-X)` can be rewritten as `user_id IS NOT DISTINCT FROM (select auth.uid())` in one line, but pure mechanical `auth.uid()` → `(select auth.uid())` replacement is easier to justify as a perf-only fix with zero semantic risk. Postgres should dedupe the identical subquery initplans — not a perf concern for three references in the same predicate.
- **Kept `idx_feedback_created_at` despite the `unused_index` INFO**: `feedback` has 1 row total, so of course the index hasn't been hit yet. The admin dashboard sorts by `created_at DESC`, so once feedback accumulates the index earns its keep. Cheap to keep, pointless to drop.
- **Index naming is deliberately inconsistent**: matches each table's existing convention instead of globally unifying. Renaming existing indexes for consistency is bikeshed territory; matching local precedent means `git blame` next to each table shows a coherent pattern. Not worth a separate migration just to rename.

### Open Items
- **Run + verify**: paste into Supabase SQL Editor → run. Reload Advisors → Performance. Expected result: zero `auth_rls_initplan` rows, zero `unindexed_foreign_keys` rows. The only item left should be the `unused_index` INFO on `idx_feedback_created_at` (intentional, see above) and `rls_enabled_no_policy` on `market_insight_runs` (intentional, phase 40).
- **Smoke test**: the policy rewrites should be transparent. Quick checks — sign in, load profile (exercises `user_profiles` SELECT), upvote a price (exercises `votes` SELECT/INSERT/UPDATE), toggle a brand favorite (exercises `user_favorites` ALL). All should work identically to before; any rejection means a policy predicate got transcribed wrong.

---

## [Unreleased] - Tighten stations/votes RLS + pin recount_parish search_path - 2026-04-23

### Security 🔒
- 🟠 **`rls_policy_always_true` on `public.stations` INSERT** (`migrations/schema_phase48_tighten_rls_policies.sql`): Dropped the legacy `"Anyone can insert stations (for initial seeding)."` policy from [schema.sql:47-48](migrations/schema.sql#L47-L48). With `WITH CHECK (true)`, any anon-key holder could spawn fake stations anywhere in Estonia. Verified no client code inserts stations — only `src/components/StationDrawer.tsx` touches the DB for user writes, and seeding/manual additions (phase 32/42/44) run as `service_role` which bypasses RLS. Policy was dead weight; dropped.
- 🟠 **`rls_policy_always_true` on `public.votes` INSERT** (same migration): Replaced phase 9's `"Anyone can vote."` policy (also `WITH CHECK (true)`) with `votes_insert_scoped`, which binds `user_id` to the caller's identity: `(auth.uid() is null and user_id is null) or (auth.uid() is not null and user_id = auth.uid())`. Mirrors the actual client flow in [StationDrawer.tsx:85-132](src/components/StationDrawer.tsx#L85-L132) — anon inserts `{user_id: null}`, authed inserts `{user_id: auth.uid()}`. Blocks the prior forgery vector where anon could POST a vote attributed to any user's UUID.
- 🟢 **`function_search_path_mutable` on `public.recount_parish`** (same migration): `alter function … set search_path = public, pg_temp`. Phase 29's trigger was the last stray — `enforce_price_submit_proximity` (phase 31), `get_display_name` (phase 45), and `get_share_discovery_publicly` (phase 47) all already had it pinned. Low-risk search-path-hijack lint, but the fix is a single line.

### Key Decisions
- **Dropped the stations policy instead of scoping it**: no legitimate non-service_role writer exists or is planned. Adding `using (auth.uid() is not null)` or similar would leave the door open for an authed user to insert garbage stations; no policy at all + service_role-bypass-RLS is the correct shape.
- **Bound votes to `auth.uid()` exactly, not `user_id is not null` or role-gated**: the client code does the right thing already — `user_id: null` for anon, `user_id: userId` for authed. Mirroring that in RLS both matches reality and is the tightest possible check. A broader `user_id is not null` check would let anon forge votes as a random UUID; a narrower "authed-only" check would break anonymous voting (a used feature via the localStorage dedup branch).
- **Left `market_insight_runs` RLS-enabled-no-policy alone**: INFO-level advisor, intentional from phase 40 — cron audit table, `service_role` only, no legitimate anon/auth read path. Adding a policy that no one can satisfy would be cargo-culting.
- **Didn't handle `auth_leaked_password_protection` in SQL**: it's a Supabase Auth dashboard toggle, not a database change. **Pro-tier only** — not available on the free plan, so this advisory will keep firing until the project upgrades. The lint can be safely ignored on free tier; revisit if/when on Pro by flipping it at Dashboard → Authentication → Providers → Email → "Password requirements" → enable HaveIBeenPwned check.

### Open Items
- **Run the migration**: after applying phase 48 in the Supabase SQL Editor, reload Advisors → expect zero ERROR, zero WARN, and only the `rls_enabled_no_policy` INFO on `market_insight_runs` (intentional) plus the `auth_leaked_password_protection` WARN (Pro-tier-only, intentional on free plan).
- **Post-run smoke check**: the votes policy is the one change with user-facing surface area. Verify both flows in kyts.ee — (1) sign in, upvote a price, confirm it sticks; (2) sign out, upvote a different price, confirm it sticks. Both should still work; any failure means the policy predicate is off.

---

## [Unreleased] - `security_invoker=true` on all 8 public views - 2026-04-23

### Security 🔒
- 🟠 **`security_definer_view` on 8 public views** (`migrations/schema_phase47_security_invoker_views.sql`): Supabase advisory surfaced after phases 45/46 cleared the two CRITICAL rows and the ERROR-level rows became visible. All 8 public views (`v_prices_earning`, `v_user_discoveries`, `v_user_parish_progress`, `v_leaderboard_7d`, `v_leaderboard_30d`, `v_leaderboard_all`, `v_reporters`, `v_discovery_leaderboard`) were created with Postgres's default `security_invoker = false`, which makes the view execute with the creator's privileges — RLS on underlying tables is checked against the creator, not the caller. Supabase's linter (mis-named "SECURITY DEFINER") flags this as an ERROR on every public view. Active risk today was narrow: almost every table the views read (`prices`, `stations`, `votes`, `parishes`, `maakonnad`) has a public SELECT policy, so creator-vs-caller is moot. The one real gap was `v_discovery_leaderboard`: it read `share_discovery_publicly` from `user_profiles` directly, and `user_profiles.SELECT` is gated on `auth.uid() = id`, so the view was returning that column for users other than the caller — harmless for a flag that's public-by-intent, but exactly the pattern the linter flags. Fix: new security-definer helper `public.get_share_discovery_publicly(uuid)` mirroring the phase 45 `get_display_name` shape; `v_discovery_leaderboard` rewritten to call it instead of the direct subquery; then `alter view … set (security_invoker = true)` on all 8 views. After this, every cross-RLS user_profiles read routes through a definer function (intentional bypass, narrow scope) and every other table read respects the caller's RLS.

### Key Decisions
- **`security_invoker = true` across the board, not just the flagged view touching `user_profiles`**: partial adoption would leave the linter firing on the other 7 — and once `v_discovery_leaderboard` is safe via the helper, the same pattern applies to every other view with zero behavior change (the tables they read are public-readable anyway). One migration, all 8 views, linter quiet.
- **Mirrored the phase 45 `get_display_name` shape for `get_share_discovery_publicly`**: `language sql security definer stable set search_path = public`, `grant execute … to anon, authenticated`. Consistency makes both helpers obvious to anyone reading the schema — they're the two designated "user_profiles read surfaces" for the public API. Any future user_profiles field that needs to be visible to anon should follow the same pattern instead of growing a new direct-read subquery in a view.
- **Didn't drop and recreate `v_discovery_leaderboard`**: `create or replace view` works because the column list, types, and order are unchanged — only two expressions swapped for helper calls. Phase 30's original drop-and-recreate was necessary for that phase's column addition, not for this kind of internal rewrite.
- **Left these 8 issues for a follow-up migration instead of bundling into phase 45**: phase 45 was scoped to `auth_users_exposed`. Bundling would have triggered the same fix (security_invoker + helper) but made the diff harder to reason about. Separate migration, separate CHANGELOG entry, clean rollback story.

### Open Items
- **Advisors not yet verified cleared for phase 47**: migration written but not yet run. After applying in Supabase SQL Editor, reload Advisors → Security Advisor and confirm all 8 `security_definer_view` rows are gone. Expected result: zero CRITICAL and zero ERROR rows on this project.
- **Post-run smoke check**: Avastajad leaderboard ("Vaata kaarti" button next to opted-in users) + Profile (parish/maakond progress counters via `v_user_parish_progress`) + Edetabel tabs (7d/30d/all). All should render identically to before — helper functions preserve the exact same coalesce behavior the inline subqueries had, and `security_invoker=true` on the other 7 views changes nothing because their underlying tables are all public-readable.

---

## [Unreleased] - Supabase security advisories closed (RLS on region tables + auth.users unexposed from public views) - 2026-04-23

### Security 🔒
- 🔴 **`rls_disabled_in_public` on `public.maakonnad` + `public.parishes`** (`migrations/schema_phase46_enable_rls_regions.sql`): Supabase advisory from 2026-04-19 flagged this as a CRITICAL live vulnerability. Phase 29 created the two region-catalog tables with `grant select … to anon, authenticated` but never issued `alter table … enable row level security`. Net effect: any client holding the anon key could INSERT/UPDATE/DELETE rows in the catalog, which would break the Avastuskaart badge grid and the Avastajad leaderboard until a reseed. Fix: `enable row level security` on both tables + a read-only policy (`for select to anon, authenticated using (true)`). Writes continue to work because `recount_parish` trigger runs as the table owner and seed scripts (`scripts/parishes_seed.sql`) run as `service_role` — both bypass RLS. No anon/authenticated write path exists today and none is planned. Run this migration BEFORE phase 45 — it closes the live hole.
- 🟡 **`auth_users_exposed` on five public views** (`migrations/schema_phase45_auth_users_unexpose.sql`): Supabase advisory from 2026-04-19 flagged `v_leaderboard_7d`, `v_leaderboard_30d`, `v_leaderboard_all` (phase 37), `v_reporters` (phase 36), and `v_discovery_leaderboard` (phase 30) — all joined `auth.users` and were granted to `anon, authenticated`. No active PII leak because the select lists only surface `raw_user_meta_data->>'display_name'`, but views run with the definer's privileges so Supabase treats any `auth.users` reference in a public-granted view as an exposure channel. Fix: new `public.get_display_name(uuid)` security-definer helper holds the existing coalesce chain (`user_profiles.display_name` → `auth.users.raw_user_meta_data->>'display_name'` → `'Anonüümne'`), and the five views now call the helper instead of joining `auth.users` directly. Function mirrors the hardening pattern from `public.get_user_footprint` (phase 30) — `security definer stable set search_path = public`, `grant execute … to anon, authenticated`. Views keep identical column lists, ordering, `LIMIT 100`, and HAVING clauses so `create or replace view` succeeds; the three leaderboards also drop `u.raw_user_meta_data` from their GROUP BY (no longer referenced).

### Key Decisions
- **Security-definer helper over `security_invoker = true` on the views**: Postgres 15's `security_invoker` flag would make views run as the caller, which on anon means the `auth.users` read fails outright — the views return nothing. Wrapping the lookup in a definer function keeps the coalesce chain working while removing the raw `auth.users` reference from every public view body, which is what the linter actually checks for.
- **Read-only RLS policy for region tables, not writer policies**: the catalog is admin-maintained (seed scripts run as `service_role`) and the app has no UI path that should ever mutate a region row. A single `for select using (true)` policy matches reality; adding any write policy would re-open part of the door phase 46 is closing.
- **Run phase 46 first, then phase 45**: phase 46 patches a live vulnerability (anon clients can currently delete rows in `maakonnad`/`parishes`), phase 45 is a hardening fix with no user-facing change. Reversing the order would leave the live hole open longer for no benefit.
- **Didn't drop + recreate the views**: `create or replace view` works for all five because the column list, types, and order are preserved — the only change is the expression that produces `display_name`. Phase 30's earlier drop-and-recreate of `v_discovery_leaderboard` was necessary because it added a new column (`share_discovery_publicly`); that doesn't apply here.

### Open Items
- **Advisors not yet verified cleared**: migrations written but not yet run. After applying both in the Supabase SQL Editor, reload dashboard → Advisors and confirm both `auth_users_exposed` and `rls_disabled_in_public` rows are gone for project `sdtwolcoibcobpzgfqxx`.
- **Smoke test the display_name resolution**: open kyts.ee after running phase 45, check Edetabel / Avastajad tabs render names (not all "Anonüümne"), and verify StationDrawer "Teatas: X" attribution on a known user's price still shows. If a user's profile has no `display_name` in `user_profiles` but has one in `auth.raw_user_meta_data`, the helper should still find it — the security-definer function reads `auth.users` on their behalf.
- **Confirm anon write-block on region tables**: optional but definitive — curl `POST /rest/v1/maakonnad` with the anon key and expect 401/403. Prior to phase 46, this would have succeeded. Don't do this in prod until phase 46 has actually run, obviously.

---

## [Unreleased] - Travel-time velocity check on price inserts - 2026-04-19

### Added ✨
- 🟡 **New `BEFORE INSERT` trigger rejects physically impossible price submissions** (`migrations/schema_phase43_price_velocity.sql`, `src/components/ManualPriceModal.tsx`, `src/i18n/locales/*.json`): closes the GPS-spoofing vector left open by phase 31. Phase 31 requires the submitter to be within 1 km of the station, but a spoofed `submitted_lat`/`submitted_lon` could still jump between stations hundreds of km apart within minutes. New trigger `trg_price_submit_velocity` runs AFTER `trg_price_submit_proximity` (alphabetical name ordering), looks up the user's most recent prior submission in the last 24h, computes great-circle distance between the two submitted positions (reuses phase 31's spherical-law-of-cosines math — no PostGIS dep), and rejects if `distance_km > 130 * elapsed_hours + 2` (2 km grace for GPS jitter + near-simultaneous submits). 130 km/h cap leaves headroom for legitimate Estonian highway driving (summer-only 110 km/h stretches) without permitting teleportation. Anonymous inserts (`user_id IS NULL`) are skipped — they can't farm points anyway (phase 37) and have no stable identity to chain. First-ever submissions are skipped (no prior row). Index reuse: the phase 37 `prices_user_station_fuel_reported_idx` already covers this trigger's lookup via its leading `user_id` column + backward scan on `reported_at` — no new index today. Migration ran in Supabase 2026-04-19; verified via `pg_trigger` listing that both phase 31 + phase 43 triggers are enabled. Client: one line added to `friendlyPriceSubmitError` in `ManualPriceModal.tsx` mapping the `velocity exceeded` message to a new `manualPrice.submitError.tooFast` i18n key, populated across all six locales (ET / EN / RU / FI / LV / LT). Retry logic unchanged — the violation throws SQLSTATE 23514 which `submitPricesWithRetry` already classifies as deterministic-don't-retry. Commit `3da5a34` (pushed to main; file subsequently renamed from `schema_phase39_price_velocity.sql` → `schema_phase43_price_velocity.sql` to resolve phase-number collision with already-shipped `schema_phase39_market_insights.sql`).

### Key Decisions
- **130 km/h + 2 km grace** (chosen over 90 km/h original proposal or 150 km/h permissive option): 90 km/h matches the rural speed limit but would false-block users on 110 km/h highway stretches; 150 km/h only catches cross-country teleportation. 130 km/h blocks all obvious spoofing (Tallinn → Tartu in 10 min = 1116 km/h, blocked) while leaving headroom for fast but legal highway driving. Pärnu → Tallinn (128 km) is allowed after ~1h — matches a realistic average-including-stops pace. 2 km grace absorbs GPS drift and sub-second submit timestamp clock skew.
- **Hard-block at trigger level instead of leaderboard-only dedup (phase 37 pattern)**: phase 37 silently strips points for duplicate/random spam but still lets inserts land — acceptable because spammy-but-plausible data is low-harm. Phase 43 catches data that is *physically impossible* and therefore known-bad; letting it pollute the public map defeats the point. The trigger rejects with a specific Estonian message; client retry logic already respects deterministic errors.
- **Anonymous (signed-out) submissions are exempt**: `user_id IS NULL` → `RETURN NEW` early. They have no stable identity to chain submissions against, they already can't earn leaderboard points (phase 37), and the 1 km proximity gate + entry_method check still apply. IP-based chaining was considered and dismissed — shared CG-NAT + IP rotation make it unreliable, and the anti-abuse payoff is near zero since anon spam doesn't affect the leaderboard.
- **No client-side preview check**: the previous-submission coordinates aren't in client state, and storing them in localStorage to do a pre-submit check duplicates the bookkeeping for zero UX gain — the failure rate on honest users is designed to be zero, and when it does fire, the server-authoritative error message is accurate and friendly.
- **Filename renamed from `schema_phase39_price_velocity.sql` → `schema_phase43_price_velocity.sql`**: the original push (`3da5a34`) used phase 39 without realizing the slot was already taken by `schema_phase39_market_insights.sql` (and chains 40 → 41 → 42). Supabase already ran the migration under the old filename — the DB is state-based, it doesn't care about the name. Renamed in git to restore the monotonic phase-number convention for future migrations.

### Open Items
- **Sybil (multi-account) GPS-spoofing still open**: a user with N alt accounts gets N independent velocity budgets. Same limitation phase 37 documented; deferred pending account-level trust work (verified email/phone, reputation gate). Not urgent — no observed sybil farming.
- **Honest-user false-block rate is unknown until real traffic hits**: watch Sentry for `price_submit_failed` events with `code: 23514` and message containing `velocity`. Zero events from honest users is the success signal; if any honest-user events appear, widen the 130 km/h constant or the 2 km grace.
- **First-in-window edge case**: if a user submits at Tallinn, disappears for >24h, then submits anywhere else — the 24h lookback window expires, no prior row is found, no rule fires. Acceptable — 24h is already a long gap to bridge into a spoofing claim, and tightening further would false-block real users who genuinely return after a few days.

---

## [Unreleased] - Saare Kütus brand collector now reads 5/5 - 2026-04-19

### Fixed 🐛
- 🟢 **Saare Kütus brand appeared as 3 distinct rows in the Margid accordion** (`src/utils.ts`, commit `9741a60`): of the five Saaremaa stations listed on saarekytus.ee, only those with `brand=Saare Kütus` tagged in OSM collapsed under the chain — the rest surfaced as their individual local names (e.g. "Pihtla tee tankla", "Orissaare Tankla") because `getBrand()` had no matcher for them. Added six entries to `CHAIN_PATTERNS`: one `saare kütus` brand match plus one literal match per station (`roonimäe tankla`, `aia tänava tankla`, `pihtla tee tankla`, `roomassaare tankla`, `orissaare tankla`). All five now group into a single `Saare Kütus` entry in the profile Margid accordion with `total: 5`. Kept the existing CHAIN_PATTERNS substring-match architecture intact — didn't extend `getBrand()` to accept the full station object (would have cascaded through every call site for zero gain here).

### Added ✨
- 🟡 **New migration `schema_phase42_saare_kutus_roomassaare.sql`** (commit `bd3c653`): inserts the Roomassaare tankla station (Roomassaare tee 10, Kuressaare) at 58.2224115, 22.5063515. OSM has the building at `way 213184792` tagged as a `building`, not `amenity=fuel`, so the Overpass seeder in `scripts/seed_stations.js` never picked it up. Insert is idempotent via `on conflict (latitude, longitude) do nothing`. `parish_id = 7808958` (Saaremaa vald) so the region-progress trigger auto-bumps the parish's `station_count`. With this + the CHAIN_PATTERNS change above, the Margid accordion now shows Saare Kütus X/5.

### Key Decisions
- **Enumerate 5 station names in `CHAIN_PATTERNS` instead of restructuring `getBrand()`**: the alternative was to change `getBrand()` to accept the full station object so it could inspect `amenities.brand` / `amenities.operator` from OSM — would have caught brand=Saare Kütus stations missing an explicit name. But it would have rippled through every call site (Map, Statistics, Profile, filters) and tripled the diff surface. Five literal matchers cost the same bytes and stay idiomatic with every other chain in the list. New-opening 6th stations need a one-line addition, which is acceptable for a 5-station regional chain.
- **Fix Roomassaare via DB insert, not upstream OSM**: upstream fix is cleaner long-term but takes ~1 day to propagate through Overpass and still needs a seeder re-run after that. Manual insert is instant and the `source` field in `amenities` documents why the row exists. If OSM gets fixed later, re-running the seeder is a no-op (unique on lat/lon).
- **Verified node 251240321 on "Kihelkonna mnt" is not a ghost**: Nominatim reverse-geocoded the coords (58.2632251, 22.4807832) to Kihelkonna mnt, but a fresh forward-lookup for "Aia 59 Kuressaare" returns 58.2633758, 22.4807811 — ~17 m from node 251240321. The node is the Aia tänava station, just missing a `name` tag. No action needed; the new `saare kütus` pattern already collapses it correctly.

### Open Items
- **OSM upstream fix still worthwhile**: add `amenity=fuel` + `brand=Saare Kütus` to way 213184792 (Roomassaare) and `name=Aia tänava tankla` to node 251240321 in OSM proper. Neither is urgent — Kyts now renders both correctly — but it helps every other OSM consumer and avoids divergence on next re-seed.

---

## [Unreleased] - Points "+N" toast + iOS PWA safe-area fixes - 2026-04-19

### Added ✨
- 🟢 **Floating "+N" toast on price submission** (`src/components/PointsToast.tsx`, `src/components/ManualPriceModal.tsx`, `src/App.tsx`, `src/index.css`): friend-feature request from Mihkel ("Iga kord kui raporteerid hinda ja saad punkte, ilmub ekraanile animatsiooni nurka punktide arvuga"). Signed-in users now see a `+N` pop in the top-right corner whenever they successfully submit prices, where `N` matches the number of fuel rows saved (1 per fuel, mirroring the leaderboard's `prices_count` formula in `v_leaderboard_*`). Anonymous submissions show nothing because `user_id` is null and they don't accrue leaderboard points. Implementation: tiny `PointsToast` component holds a queue of `{id, amount}` events, renders the active one with a green `--color-fresh` numeric label and dismisses after 1.8s; `ManualPriceModal.onPricesSubmitted` signature gained an optional `pointsEarned?: number` arg that all three call sites in `App.tsx` (station-selected modal, camera FAB, manual FAB) funnel into a new `handlePricesSubmitted` helper which also still triggers `loadData()`. Animation: new `pointsToastPop` keyframe in `index.css` does scale-in + drift-up + fade (1.8s, `cubic-bezier(0.2, 0.8, 0.2, 1)`), reusing the same anchor pattern as the existing `discovery-toast`. Anchored at `top: calc(80px + env(safe-area-inset-top))` so it clears the search header on PWA. Format is just the bare `+N` (no "pts" / "punkte" suffix) per Mikk's call — kept i18n-free for that reason.

### Fixed 🐛
- 🟡 **iOS PWA standalone-mode regression: white strip at the home indicator + status bar crowding the StatisticsDrawer header** (`src/App.tsx`, `src/components/Map.tsx`, `src/components/StatisticsDrawer.tsx`, `src/index.css`): regression introduced 2026-04-17 by `aa6dc0e` (apple-mobile-web-app-capable + viewport-fit=cover). Friend reported a near-white bar at the bottom of the home-screen PWA and that the status bar (time/signal/battery) felt close to drawer headers; both were invisible in regular Safari because no standalone chrome means no safe-area inset bottom. Root cause: `<main>` and the Leaflet container both sized themselves to `var(--app-height)` which == `visualViewport.height`, which in iOS PWA standalone *excludes* the home-indicator strip. Body bg (`--color-bg` = `#f5f7fa` in light theme = looks white) painted through. Fix is three coordinated changes: (1) `<main>` height in App.tsx and the map wrapper div in Map.tsx now use `calc(var(--app-height, 100dvh) + env(safe-area-inset-bottom))` so map tiles paint into the home-indicator area; (2) new CSS rule `.leaflet-bottom { bottom: env(safe-area-inset-bottom) !important; }` shifts Leaflet's own bottom controls (notably the OSM attribution) up by the same amount so they remain readable above the home indicator; (3) `StatisticsDrawer` padding-top now includes `env(safe-area-inset-top)` so the "Statistika" header has breathing room when the 92vh sheet sits close to the status bar. Custom FABs in App.tsx already factored `env(safe-area-inset-bottom)` into their `bottom: calc(...)` offsets so their visual position stays sensible — slightly closer to the home indicator (~16pt vs ~50pt before), still clear of it. Pushed in `a4238b7`. Friend confirmed the white strip had been visible since "the start of the week" — matches the Apr 17 commit date.

### Key Decisions
- **Toast format is the bare number `+N`, no suffix**: Mikk explicitly cut "pts" / "punkte" so the toast stays language-neutral and visually minimal — no i18n keys needed across the six locales, and the green color + leading `+` already communicate "you gained something". Saves both maintenance and visual weight.
- **Anonymous submissions show no toast**: gated on `user?.id` in ManualPriceModal because anonymous prices never reach the leaderboard (their `user_id` is null and `v_leaderboard_*` group by user_id). Showing "+N" to anonymous users would be misleading. The price still saves and the data is still useful — they just don't see a points reward they aren't actually earning.
- **Extending the map past `--app-height` instead of changing body bg or shrinking the map**: alternative was to set body background to a darker color so the home-indicator strip looked intentional, but that would affect every place body shows through (initial paint, edges of all drawers, etc.). Extending the map keeps the change scoped to the regression and means the home indicator overlays a real map tile, which reads as intentional.
- **Pushing `.leaflet-bottom` up by safe-area only — not all leaflet controls**: the custom zoom +/− buttons in `Map.tsx` are NOT leaflet defaults; they're absolutely-positioned siblings already using `env(safe-area-inset-bottom)`. So the CSS rule only affects the OSM attribution and any future built-in bottom controls. Targeted fix, no side effects on the FAB stack.

### Open Items
- **FAB clearance from the home indicator dropped from ~50pt → ~16pt** as a side effect of the `<main>` extension — still readable but tighter than before. If users complain about FABs feeling cramped against the home indicator, bump each FAB's `bottom: calc(N + env(safe-area-inset-bottom))` literal in App.tsx by ~16pt to restore the prior visual buffer.
- **Same safe-area-inset-top padding pattern not yet applied to other tall drawers** (ProfileDrawer, LeaderboardDrawer, StationDrawer, FilterDrawer is already done) — only StatisticsDrawer was touched this session because that's where the friend's screenshot showed the overlap. Worth sweeping if the same complaint surfaces for another drawer.

---

## [Unreleased] - Market Insights V1 MVP - 2026-04-19

### Added ✨
- 🟡 **Market Insights UI & Database Foundation** (`migrations/schema_phase39_market_insights.sql`, `src/components/MarketInsightBanner.tsx`, `src/App.tsx`): implemented a "Version 1" MVP feature answering *why* fuel prices are fluctuating (e.g., Brent Crude shifts). Stores manual insights in a new `market_insights` Supabase table featuring multi-language text columns (`content_et`, `content_en`), activity statusing, and an enum `trend` indicator (`up`, `down`, `flat`). The frontend automatically polls the latest active record on initial load and renders it as an amber-tinted glassmorphic banner beneath the main search control. Includes dynamic layout offsetting to respect filter pill positions and the *Avastuskaart* mode banner, resolving visual overlap automatically. Persistent dismissals natively track read insights via `localStorage['kyts-dismissed-insights']`.

---

## [Unreleased] - Brand collector on the Avastuskaart - 2026-04-19

### Added ✨
- 🟡 **New "Margid" brand-collector accordion under Avastuskaart** (`src/utils.ts`, `src/App.tsx`, `src/components/ProfileDrawer.tsx`, `src/i18n/locales/*.json`): tracks how many distinct station brands a user has submitted a price at, so the discovery UX now has both a geographic axis (maakond/vald/jaam) and a commercial one (Circle K / Olerex / Neste / Alexela / …). Summary pill in the Avastuskaart panel shows `Margid: X/Y` where X = brands with ≥1 contribution and Y = total brands in the station catalog. Expanding it lists every brand as a row with a tabular-numerics `done/total · %` chip — green with a 🏆 when complete, blue when partial, grey when untouched. Each row is itself expandable into the list of stations the user has collected for that brand; each station is a tap target that opens the station panel (closes the drawer, same interaction as Favorites). Empty brands (0/N) show a muted "X left to discover" helper; partial brands append the same line under the collected-stations list so progress feels directional, not just cumulative. Data: new `BrandProgress` type in `utils.ts` carries `{ brand, done, total, collectedStationIds }`; `userBrandProgress` `useMemo` in `App.tsx` builds it by bucketing the full station catalog via `getBrand()`, skipping the `Tundmatu` sentinel so unbranded stations don't bloat the collector, and sorting by done-desc then brand-alpha so the user's trophy row grows top-down. Totals are computed off the full catalog deliberately — the LV-stations view toggle doesn't shrink denominators, so a user who toggles LV off still sees their Virši-A / Viada / KOOL / Astarte Nafta progress with stable ratios. i18n: added `profile.discovery.brands.{summary,noBrands,emptyBrand,remaining}` keys to all six locales (ET / EN / RU / FI / LV / LT).

### Key Decisions
- **Compact pill + nested accordion over full-width grid**: grid layout would duplicate the visual weight of the maakond badge grid right above and compete for attention; a collapsed pill that expands on demand keeps the default drawer height unchanged and lets power users drill in without crowding casual users.
- **Brand taxonomy reuses `getBrand()` / `CHAIN_PATTERNS` — no hard-coded brand list**: new brands that appear in the station catalog (future LV expansion, a new chain showing up in OSM, renamed operators) auto-populate without a code change. `Tundmatu` is filtered out so the "unknown" bucket doesn't mascarade as a collectible brand.
- **Catalog-wide totals regardless of LV toggle**: denominators tied to the view filter would flip mid-session and turn a 7/12 into a 7/8 after toggling LV off — feels like losing progress. Totals are a property of the catalog, the toggle just hides rendered markers.

---

## [Unreleased] - Cross-device theme sync - 2026-04-19

### Added ✨
- 🟡 **Theme preference now syncs to `user_profiles.theme`** (`migrations/schema_phase38_theme_sync.sql`, `src/App.tsx`, `src/components/ProfileDrawer.tsx`): signed-in users get their chosen dark/light theme back on any device / any browser / after localStorage loss. Motivated by a real user report — a friend's iOS home-screen PWA kept reverting to system dark between launches, strongly suspected to be scope-escape from a www-era install (PWA manifest scope = `www.kyts.ee`, every launch redirects to apex, theme writes land on one origin and reads come from the other). This column alone doesn't fully fix *that* case (if scope escape also kills the Supabase session, there's nothing to read from — that friend still needs to delete + re-add the home screen icon from `https://kyts.ee`) but it closes every adjacent leak for signed-in users: Safari ITP 7-day first-party localStorage eviction, "clear cookies on close" privacy settings, and plain device-switch. Migration adds a nullable `theme varchar(5)` column with a `CHECK (theme IS NULL OR theme IN ('dark', 'light'))` constraint — null means "no server-side preference yet, respect localStorage / system", matching the pattern already used by `language` / `show_latvian_stations`. Client changes: (1) `loadData` signed-in branch fetches `theme` alongside other prefs and applies it to both state and localStorage when non-null; (2) new `handleMapStyleChange` handler in App.tsx centralizes theme writes — does `setMapStyle` + `localStorage.setItem` + `user_profiles.upsert({ theme })` when session exists, exactly mirroring `handleSharePubliclyChange`; (3) both previous callsites (AuthModal prop + ProfileDrawer prop) now point at this single handler instead of their ad-hoc inline writes, and `ProfileDrawer.tsx:850` drops its redundant inline `localStorage.setItem` since the parent now handles it. Signed-out reset branch is *intentionally unchanged* — theme is a device-level aesthetic preference more than an account-level one, and flipping themes on logout (as `hide_empty_dots` et al. do) would be surprising on a shared device. Rollback: `alter table user_profiles drop column theme;` is safe any time — clients fall back cleanly to localStorage + system preference.

---

## [Unreleased] - Spam-resistant leaderboard points - 2026-04-19

### Changed 🔧
- 🟡 **Leaderboard now ignores spammy resubmissions when counting `prices_count`** (`migrations/schema_phase37_points_dedup.sql`): the `prices` table stays fully open — every insert still succeeds, users can keep correcting typos and updating prices freely with no cooldown or blocked submission UX. The anti-abuse rule lives inside the three `v_leaderboard_*` views only. A row now earns a point iff **both** (a) this exact `price` value has NOT been submitted by the same user for the same `(station_id, fuel_type)` in the last 1h (kills duplicate / alternating spam like 1.60 → 1.55 → 1.60 → …), AND (b) the user has submitted fewer than 2 distinct prices for that `(station, fuel)` in the last 1h (kills random-value spam like 1.60 → 1.55 → 1.50 → …). Cap of 2 deliberately preserves the honest case — 1 initial report + 1 legitimate correction or witnessed price change — since real fuel totems update a few times a day in Estonia, not twice an hour. Implementation: new composite index `prices_user_station_fuel_reported_idx` on `(user_id, station_id, fuel_type, reported_at)` so each subquery stays O(log N); new helper view `v_prices_earning` tags every row with `earns_point` so the rule lives in exactly one place; each leaderboard view swaps `count(distinct p.id)` for `count(*) filter (where p.earns_point)` and adds `HAVING prices_count > 0` so spam-only users drop out of the ranking entirely; `upvotes_received` stays untouched because it reflects community trust on a price, not contributor effort, and is already capped by the per-`(user, price)` UNIQUE on `votes`. Pre-deploy diagnostic against prod (new `scripts/diagnose_point_spam.js`) showed 2.2% of the last 30d's 592 submissions would not have earned under the new rule — concentrated in two accounts from the app's early testing phase, all from rule-(a) duplicate scans; rule-(b) never fired in real traffic. Rollback: re-apply `schema_phase16.sql`, fully reversible since every statement is `create or replace view` or `create index if not exists`. Caveat not addressed: multi-account (sybil) farming — separate fight, needs account-level trust (verified email/phone). Commit `52bca97`.

### Added ✨
- 🟢 **Read-only point-spam diagnostic** (`scripts/diagnose_point_spam.js`): node script that pulls the last 30d of price submissions via `SUPABASE_SERVICE_ROLE_KEY` and replays the phase 37 earning rule in JS, printing total vs. earning rows and top offenders grouped by rule-a (duplicate price) vs. rule-b (cap exceeded). Useful for periodic spot-checks on leaderboard health; run with `node scripts/diagnose_point_spam.js` from project root.

---

## [Unreleased] - Contact email → `kyts@mikkrosin.ee` - 2026-04-19

### Changed 🔧
- 🟢 **Swapped every `info@kyts.ee` reference to `kyts@mikkrosin.ee`** (`src/components/PrivacyModal.tsx`, `src/components/TermsModal.tsx`, `src/i18n/locales/et.json`, `src/i18n/locales/en.json`, `public/privacy.html`, `public/terms.html`, `LICENSE`, `CHANGELOG.md`): in-app legal modals (et+en JSON), their `mailto:` hrefs, the static HTML mirrors Google's consent-screen bot scrapes, the LICENSE licensing-inquiries line, and CHANGELOG history. Also swapped the one `mikk.rosin@gmail.com` mention (CHANGELOG entry about Google Auth Platform support email) to the same address. Two-commit arc: `65d45f2` (→ `info@mikkrosin.ee`) → `82e04aa` (→ `kyts@mikkrosin.ee` after Mikk changed his mind mid-task). Rationale: route inbound mail about a project-specific service to a project-specific mailbox, not a shared personal inbox. Final grep across the tree confirmed zero remaining `info@kyts.ee` / `mikk.rosin@gmail` / `info@mikkrosin.ee` references. The `translations/` working `.md` files were also updated locally (gitignored) so any future Google-Translate re-merge of the legal chunks doesn't regress the email.

---

## [Unreleased] - Avastuskaart region suffix translation - 2026-04-19

### Fixed 🐛
- 🟡 **County / parish / city suffixes (`maakond`, `vald`, `linn`) now translate on the Avastuskaart** (`src/utils.ts`, `src/components/DiscoveryBadgeGrid.tsx`, `src/components/CelebrationOverlay.tsx`, `src/components/DiscoveryBanner.tsx`, `src/components/Map.tsx`, `src/i18n/locales/*.json`): with English selected, places like "Harju maakond" / "Jõelähtme vald" / "Narva linn" still read in Estonian across the discovery UI. Added `localizeRegionName(name, t)` + `stripRegionSuffix(name)` helpers in `utils.ts` that split on the last space and replace a whitelisted suffix via the new `region.suffix.{maakond,vald,linn}` keys, preserving the proper-noun half untouched. Called from every discovery surface: the 15-maakond tile grid in the Profiil panel, the expanded parish list, celebration toasts (parish-done, maakond-done bursts), the `DiscoveryBanner` focused-maakond label, and — follow-up commit `b32f160` — the Leaflet `divIcon` labels `RegionLabelsLayer` paints directly on the map overlay (effect deps now include `i18n.language` + `t` so labels live-repaint on a language switch). Initial commit `aa3444f` missed the map-overlay labels because the refactor only swept React-rendered text; the follow-up added `useTranslation` to `RegionLabelsLayer` and wraps every `name` read. Translation keys added to all six locales (ET passes through, EN gives "County" / "Parish" / "City", RU/FI/LV/LT populated in the same PR). Design choice: we do *not* translate the proper name ("Harju", "Jõelähtme") — an English speaker is looking at an Estonian map regardless, so only the admin-type descriptor needs to read in their language.

---

## [Unreleased] - Fuel-type labels translate + language picker in tutorial - 2026-04-19

### Added ✨
- 🟡 **Language picker is now the first card in the first-run tutorial** (`src/components/TutorialModal.tsx`): new step-0 card with a hardcoded multilingual title (`Keel · Language · Kieli · Язык · Valoda · Kalba`) so it reads for any user on first paint, followed by flag + `nativeName` buttons iterating the active `LANGUAGES` catalog. Tapping a flag calls `i18n.changeLanguage(code)` which rerenders the entire tutorial (steps 1–5) in the chosen language instantly. `STEPS_LENGTH` bumped 5 → 6; body wrapper flipped from `<p>` to `<div>` so the nested button group isn't invalid HTML. Uses Lucide `Globe` icon. Rationale: new users arriving before the app has heard from them deserve to choose their language *before* reading 5 cards of onboarding prose — previously they had to skim ET/EN content, dismiss the tutorial, find Profile → Seaded → Keel, switch, then re-open the tutorial.

### Fixed 🐛
- 🟡 **Fuel-type labels ("Bensiin 95", "Bensiin 98", "Diisel", "LPG") now translate across the UI** (`src/utils.ts`, `src/components/StationDrawer.tsx`, `src/components/StatisticsDrawer.tsx`, `src/components/ManualPriceModal.tsx`, `src/components/ProfileDrawer.tsx`, `src/components/FilterDrawer.tsx`, `src/i18n/locales/*.json`): previously these rendered verbatim everywhere regardless of `i18n.language` because they double as DB-layer canonical identifiers — switching the source strings would break every `prices.fuel_type` row and every comparison. Fix keeps the canonical Estonian strings as DB IDs and adds a `fuelLabel(type, t?)` display-layer wrapper in `utils.ts` that looks up `fuelType.{bensiin95,bensiin98,diisel,lpg}` keys, falling back to the canonical ET string when the key resolves to itself (safety net for partial locales) or when `t` is absent. Every `{type}` JSX render across the five consumer components changed to `{fuelLabel(type, t)}`. New `fuelType.*` block added to all six locale JSONs. Data layer (filters, favorites, brand-match, leaderboard queries) reads the untranslated canonical string throughout — zero DB migration needed.

---

## [Unreleased] - Multi-language support (ET / EN / RU / FI / LV / LT) - 2026-04-19

### Added ✨
- 🔴 **Full i18n infrastructure with six languages live** (`src/i18n/index.ts`, `src/i18n/locales/{et,en,ru,fi,lv,lt}.json`, `src/main.tsx`, `src/App.tsx`, `src/components/ProfileDrawer.tsx`, 21+ component files, `migrations/schema_phase35_language_pref.sql`, `translations/`): every JSX literal, `alert()`, placeholder, `aria-label` and `title` attribute across the 21 user-facing components + `utils.ts` + `App.tsx` now goes through `useTranslation` / `t('key.path')`. ET stays source of truth, EN ships at full parity (385/385 keys), RU / FI / LV / LT at 271/385 — the PrivacyModal + TermsModal fall back to EN for those four locales with an inline `legal.notice.englishOnly` notice (GDPR liability makes hand legal review only). `i18n-browser-languagedetector` bootstrap order: `localStorage['kyts-language']` → `navigator.language` → ET fallback, initialized synchronously in `main.tsx` before React mounts (no flash of wrong language). Picker lives as the first item in Profile → Seaded as a glass-panel-styled native `<select>` (chevron via inline SVG); choice persists to the new `user_profiles.language` column (mirrors the `show_latvian_stations` pattern 1:1 — load on session, write on toggle, wipe localStorage on logout) plus `kyts-language` localStorage for anonymous users. The six-language catalog lives as `ALL_LANGUAGES` + runtime-filtered `LANGUAGES` (includes any locale whose JSON has ≥1 key, so half-translated languages auto-hide from the picker until populated). Plural-aware keys use i18next's `_one` / `_other` (and `_few` / `_many` when RU/LV/LT stubs get populated) via the `count` interpolation. **Migration file `migrations/schema_phase35_language_pref.sql`** adds the column; Mikk runs it manually in the Supabase SQL editor. Translation workflow lives in the gitignored `translations/` dir: one numbered `NN_<surface>.md` chunk per UI context (tutorial, auth, profile-seaded, profile-other, map+FAB, manual-price, station-drawer, leaderboard+stats, feedback+filters, legal), round-tripped through Google Translate per non-EN language, parsed back via `translations/_merge.mjs`. Legal chunk 10 is EN-only; shipped 2026-04-19 as commit `55f1b07`. Drive-by fix: `filter.findCheapest.hint` silently never resolved before because i18next treats `.` as a key separator and `filter.findCheapest` already held a string — renamed to `filter.findCheapestHint`.

### Key Decisions
- **react-i18next over i18next-plain / FormatJS / react-intl**: plural-rule maturity for RU / LV / LT (3 plural forms each), lazy-load per language, `useTranslation` hook ergonomics, ~40 KB cost amortized across six locales.
- **Single flat JSON per language, not namespaces**: at 385 keys the namespace ceremony isn't worth it — one file is greppable and reviewable as a unit. Dot notation groups keys (`tutorial.step1.title`, `manualPrice.error.tooFar`).
- **Big-bang ET+EN rollout**: mixed-locale production (some strings ET, some EN) would be worse than ET-only — users would assume the feature is broken. Shipped ET+EN at parity; RU/FI/LV/LT scaffolded with empty JSONs and auto-light-up in the picker as each is populated incrementally in follow-up PRs.
- **Legal modals EN-only for non-ET/EN users**: machine-translated legal copy under GDPR is real liability for a hobby-scale project; hand-translation by lawyers across 4 more languages isn't proportionate. Inline `legal.notice.englishOnly` notice sets expectations. Revisit if Kyts ever takes commercial form.
- **Canonical-ID vs display-label split for fuel types**: deferred to its own follow-up (see entry above) — DB identifiers stay untranslated, only UI display wraps in `fuelLabel()`.

---

## [Unreleased] - Station-discovery celebration - 2026-04-18

### Added ✨
- 🟡 **New-station discovery now fires a celebration toast with progress bar** (`src/hooks/useRegionProgress.ts`, `src/components/CelebrationOverlay.tsx`, `src/components/Map.tsx` → `App.tsx` via `stationNamesMap`, `src/index.css`): when a user reports a price for a station they've never contributed to before, a glass-style toast slides in above the parish-completion slot with "🎉 Uus jaam avastatud!", the station name, and a thin animated progress bar showing `X / Y jaama kogutud`. Feature request from a friend: *"Uut jaama esmakordselt avastades (hindu raporteerides) näidata animatsiooni ja progressi"*. `CelebrationEvent` union extended with a `station` kind (stationId, stationName, done, total); `CelebratedStore` in localStorage now persists a `stations: string[]` array alongside parishes/maakonnad so returning contributors don't get 50 retroactive toasts on first mount (seed absorbs current `contributedStationIds`). Station events fire FIRST in the diff loop so if a single submission triggers both a new-station + a vald-completion, the station toast queues ahead of the parish toast. Critically, station events are NOT gated on the Avastuskaart toggle — they're tied to the act of *submitting a price*, not to the map-view mode (so a user who never discovers Avastuskaart still gets rewarded for reporting). Overlay adds a `stationQueue` state + `activeStation` with 2000 ms auto-dismiss matching the `slideInFade` 2 s keyframe; toast sits at `bottom: calc(env(safe-area-inset-bottom, 0px) + 160px)` — 70 px above the parish slot so they can coexist on the same submission. Progress bar uses a new `@keyframes discoveryProgressGrow` (`scaleX 0→1` with `transform-origin: left`, 0.8 s cubic-bezier, 0.2 s delay) so the fill visibly "grows in" rather than flashing. `stationNamesMap` is a new `useMemo` over the full stations catalog in `App.tsx`, passed into `useRegionProgress` purely for toast copy.

---

## [Unreleased] - Zoom +/− buttons on the map - 2026-04-18

### Added ✨
- 🟡 **Zoom `+` / `−` buttons on the bottom-left of the map** (`src/components/Map.tsx`): pinch-to-zoom works on mobile but Leaflet has no one-finger zoom-out gesture, so users had to reach with two fingers to zoom out — awkward one-handed or with a phone on a dashboard mount. New `ZoomControls` component renders two 50 px glass-style buttons (`Plus` / `Minus` from lucide-react) mirroring the GPS locator on the right: `+` at `bottom: 140 px`, `−` at `bottom: 80 px`, both at `left: 20 px` with safe-area inset. Bottom position leaves ~40 px clear above the "Kyts" watermark so the two don't collide visually. Uses `useMap()` → `map.zoomIn() / map.zoomOut()` for the actual zoom. The stock Leaflet zoom control is still disabled (`zoomControl={false}`) — this keeps the glass-panel aesthetic and matches the FAB styling 1:1.

---

## [Unreleased] - Vald hover + tap-hold highlight on Avastuskaart - 2026-04-18

### Added ✨
- 🟢 **Valds (parishes) now glow subtly blue when hovered (desktop) or tap-and-held (mobile) on the Avastuskaart** (`src/components/Map.tsx`): soft blue wash — lighter than the green "completed" state so the two read as different kinds of highlight (reward vs "you're pointing at this"). Light mode `#3b82f6` fill @ 10% + `#2563eb` stroke; dark mode `#60a5fa` fill @ 14% + `#93c5fd` stroke. `DiscoveryParishLayer` flipped from `interactive: false` → `interactive: true` with `onEachFeature` binding `mouseover`/`mouseout`/`mousedown`/`mouseup`/`mousemove` handlers per sublayer. Tap-and-hold is a 350 ms `mousedown` timer (Leaflet fires mouse events for touch on paths, so one code path covers both input types); timer auto-cancels on `mouseup`, `mouseout`, or `mousemove` so a flick-pan or quick tap doesn't leave a dangling highlight. On release the polygon either goes back to its base style (mobile, no hover to return to) or back to hover (desktop, cursor still over). All handlers read the current base-style classifier + hover-style via refs, so completed/focused/dim transitions and theme toggles update without rebinding events. Hover/hold is suppressed on valds that are currently hidden (zoomed out and not inside a focused maakond) so the cursor doesn't light up empty space at country scale. Refactor bonus: the base-style picker (hidden / completed / focused / dim) is now a single function reused by all handlers and the prop-change style-application effect, deduplicating what used to be two copies of the same classifier.

---

## [Unreleased] - Kasutajanimi moved to Edetabel - 2026-04-18

### Changed 🔧
- 🟢 **Display-name editor relocated from ProfileDrawer into LeaderboardDrawer** (`src/components/LeaderboardDrawer.tsx`, `src/components/ProfileDrawer.tsx`, `src/App.tsx`): the nickname field now lives where it's actually surfaced to other users — inside the Edetabel, as a compact inline row (UserCircle icon + "Sina:" label + text input) above the ranking list. Saves on blur + Enter, same 32-char cap and `Anonüümne` placeholder as before. Only renders when signed in and a handler is wired (`currentUserId && onDisplayNameChange`). The standalone "Kasutajanimi (nähtav edetabelis)" `glass-panel` card in ProfileDrawer's Profiil tab is gone along with its `nameDraft` state and sync effect, and `displayName` / `onDisplayNameChange` props moved from the `<ProfileDrawer>` call-site to `<LeaderboardDrawer>` in `App.tsx`. Rationale: the label was technically correct in the old location but users only think about their name when they *see* the leaderboard, so editing inline there removes a drawer-hop.

---

## [Unreleased] - Profile drawer tidy-up - 2026-04-18

### Changed 🔧
- 🟢 **Next-badge progress bar moved into the profile header** (`src/components/ProfileDrawer.tsx`): the thin progress bar + "X kuni 🌲 Sprinter" hint now sits directly under the current badge label, capped at `maxWidth: 180px` so it doesn't crowd the logout/X buttons. Hides entirely at the max tier (`getNextTier` returns null). Shows for viewed-user mode too since it reads from the same `userPricesCount + userVotesCount` props.
- 🟢 **Removed the "Sinu panus" card** (`src/components/ProfileDrawer.tsx`): the two big number tiles (Hinda edastatud / Häält antud) + duplicate progress bar are gone. Panuse skoor (prices+votes) is already shown in the Edetabel next to every user, and per-station contribution footprint lives in Avastuskaart — the card was redundant once those two features landed. The `Award` icon import is dropped along with it.

---

## [Unreleased] - Avastuskaart completed-vald highlight - 2026-04-18

### Added ✨
- 🟢 **Completed valds (parishes) get a soft green wash on the Avastuskaart** (`src/components/Map.tsx`, `src/App.tsx`): when every station inside a vald has a contribution from the currently-displayed user's footprint, the vald polygon fills with a subtle green tint and gets a brighter stroke — a visual reward-indicator to complement the existing 🌱→♾️ title tiers. Style shifts with basemap: `#22c55e` fill @ 18% opacity / `#15803d` stroke on light, `#4ade80` fill @ 22% / `#4ade80` stroke on dark. The highlight respects the existing zoom/focus visibility gate (zoom ≥ 9 or inside a focused maakond) — a country-scale wash of green specks would be noise, not reward. `completedParishIds` is computed inline in `App.tsx` from whichever station-set is on screen (mine when self-viewing, `viewedUser.stationIds` when inspecting someone else's footprint), deliberately separate from `useRegionProgress`'s self-only `completedParishIds` which gates celebration toasts.

---

## [Unreleased] - Hepa Kehtna dedupe - 2026-04-18

### Fixed 🐛
- 🟢 **Ghost "Hepa" station in Kehtna alevik merged into the real HEPA row** (`migrations/schema_phase34_hepa_kehtna_dedupe.sql`): OSM had two separate nodes for the same physical tankla — the real one tagged `HEPA` (uppercase) and a ghost ~20–30 m north tagged `Hepa` (title case). Migration pins both ids in a temp table, moves `prices` + `user_favorites` from the ghost to the real row, deletes the ghost, and leaves the display name as `HEPA`. Aborts with a clear `RAISE EXCEPTION` if the Kehtna bbox catches anything other than exactly one `HEPA` + one `Hepa`, so a stale name rename couldn't silently clobber data. Ran in Supabase 2026-04-18; verify SELECT shows one row with 3 prices retained. Brand canonicalizer at `src/utils.ts:148` already collapses both spellings to the `Hepa` brand, so filtering/loyalty was unaffected throughout.

---

## [Unreleased] - Update banner "Värskendan…" hang fix - 2026-04-18

### Fixed 🐛
- 🔴 **Update banner now actually reloads** (`src/utils/swUpdate.ts`): user reported tapping "Värskenda" just left the button stuck on "Värskendan…" forever. Root cause: `vite.config.ts` has `skipWaiting: true` in the Workbox config, which makes the new service worker activate immediately on install and fire `controllerchange` before the user can tap the banner. By the time `applyUpdate` runs, there's no "waiting" SW left for Workbox's `updateSW(true)` helper to message, so it silently no-ops — no reload, no error, just a hang. Fix: `applyUpdate` now unconditionally calls `window.location.reload()`. The new SW is already the controller by the time the banner shows, so a plain reload picks up the fresh JS/HTML bundle it's already serving. The `registerApply`/`applyFn` plumbing is kept in place but now unused — harmless and preserves call-sites if we ever switch back to `skipWaiting: false`.

---

## [Unreleased] - iOS notch safe-area fix for top search bar - 2026-04-18

### Fixed 🐛
- 🟡 **Top search bar no longer hides under iOS status bar/notch** (`src/App.tsx`): friend reported the iPhone status bar (time, signal, battery) was overlaying the search bar on an installed PWA. `viewport-fit=cover` was already set in `index.html` (edge-to-edge rendering) and every other fixed-position element in the app respects `env(safe-area-inset-bottom)`, but the top search bar sat at a hard `top: '20px'` and had no `safe-area-inset-top` counterpart — so on devices with a notch/dynamic island (iPhone X+), it rendered under the 44–59 px status area. Changed to `top: 'calc(20px + env(safe-area-inset-top))'`. The filter pills row, search dropdown, and DiscoveryBanner are all positioned relative to the same parent or already use the inset, so the gap below stays consistent. `env()` resolves to `0px` on non-notched devices, so no visual change for desktop/Android.

---

## [Unreleased] - OAuth consent branding + static legal pages - 2026-04-18

### Added ✨
- 🟡 **Static `/privacy.html` + `/terms.html` pages** (`public/privacy.html`, `public/terms.html`): standalone HTML pages mirroring `PrivacyModal.tsx` and `TermsModal.tsx` 1:1. Needed because the Google OAuth consent screen requires public URLs for privacy policy and terms of service — in-app modals won't do, Google fetches the URL server-side. Pages are pure HTML + inline CSS with `prefers-color-scheme` for dark/light support, 720px max-width, header nav back to `/`, and canonical URL tags. Corrected a stale "www.kyts.ee" → "kyts.ee" prose item in the privacy copy while porting.
- 🟢 **Google Auth Platform branding configured**: app name set to "Kyts" (was "KütuseKaart"), support email `kyts@mikkrosin.ee`, home/privacy/terms URLs pointed at `https://kyts.ee`. Consent screen now shows "Kyts" instead of the raw `sdtwolcoibcobpzgfqxx.supabase.co` subdomain. Authorised domains list left alone — `sdtwolcoibcobpzgfqxx.supabase.co` is load-bearing (it's the OAuth callback) and `kutuse-kaart.vercel.app` is still referenced by the client's JS origins.

### Key Decisions
- **Static HTML over React routes**: Google's verification bots hit the URL directly; SPA shells with client-side routing would serve an empty `<div id="root">` with no detectable legal copy. Putting the files in `public/` lets Vercel serve them straight from the CDN at `/privacy.html` and `/terms.html` with zero SPA involvement.
- **Mirrored modal copy verbatim**: if we diverge, users get different legal text depending on whether they click the in-app button or the consent-screen link. Single source of truth (for now) = the modals; HTML pages are the mirror. If this becomes painful, we'll extract a shared Markdown source later.
- **Chose option 1 (brand existing OAuth client) over Supabase Pro custom auth domain ($25/mo)**: free, works for the non-critical trust-gap we have today. Revisit if we ever need `auth.kyts.ee` for deliverability or compliance reasons.

---

## [Unreleased] - Price submit retry + diagnostics - 2026-04-18

### Fixed 🐛
- 🔴 **Price submits now retry transiently + log failures to Sentry** (`src/components/ManualPriceModal.tsx`): user reported intermittent "Viga hinna salvestamisel!" errors requiring multiple attempts before the save went through. Sentry had zero events for this path because the failure branch at the old line 468 just called `alert()` and returned — the Supabase error object was silently dropped. Two fixes in one:
  - `submitPricesWithRetry` auto-retries non-deterministic failures once after 800 ms. SQLSTATE class 23 (integrity violations) and 42501 (RLS deny) are treated as deterministic and not retried. Transient Postgrest 5xx / TCP drops / edge-router hiccups — which were the root cause per the user's "after multiple tries it works" observation — now self-heal silently within the same submit attempt.
  - When both attempts fail, we `Sentry.captureMessage('price_submit_failed', { level: 'warning' })` with code / message / hint / station_id / fuel_types / entry_method / attempts, and mirror a `price_submit_failed` PostHog event. Warning-not-error keeps the Sentry inbox clean but still gives us a queryable record. `price_submitted` also gained an `attempts` prop so we can watch the retry-saved rate in PostHog.
  - Friendly-error helper converts the Supabase error into specific Estonian copy when we can classify it (distance rejection, RLS, missing station); otherwise a generic "proovi veel kord" prompt.

### Changed 🔧
- 🟢 **"Uued hinnad" heading** (`src/components/ManualPriceModal.tsx`): was "Uued Hinnad" — sentence-case to match the ProfileDrawer convention.

---

## [Unreleased] - Update banner for stale PWA users - 2026-04-18

### Added ✨
- 🟡 **"Uus versioon saadaval" banner with a Värskenda button** (`src/components/UpdateBanner.tsx`, `src/utils/swUpdate.ts`, `src/main.tsx`, `src/App.tsx`, `vite.config.ts`, `tsconfig.app.json`): switched `VitePWA` from `registerType: 'autoUpdate'` to `'prompt'` and wired a user-facing banner to the Workbox `onNeedRefresh` callback. When a new service worker finishes installing, the banner slides up at the bottom (z 2500, below modals) and a tap reloads the page via Workbox's `updateSW(true)`. `onRegisteredSW` adds a `visibilitychange` listener that force-calls `registration.update()` whenever the tab regains focus — catches the "PWA parked in the background for days" case where the default 24h SW update cycle won't have fired. A tiny module-scoped pub-sub (`swUpdate.ts`) bridges the boot-time registration in `main.tsx` to the component in the App tree. `skipWaiting` + `clientsClaim` stay — the new SW still activates fast in the background, the banner is just the visible nudge to reload for the fresh JS bundle. `vite-plugin-pwa/client` added to `tsconfig.app.json` types for the `virtual:pwa-register` module.

### Key Decisions
- **Prompt mode over autoUpdate**: autoUpdate's silent-reload-on-activate is great when it works but opaque when it doesn't — users had no feedback loop when they were still seeing old UI. A visible banner makes the "new version available" state explicit and lets the user reload on their own terms.
- **Non-dismissible banner (for now)**: a dismiss "X" would defeat the entire premise (users sitting on stale bundles). If it proves annoying, add a dismiss that re-shows on the next session — not across reloads.
- **z-index 2500 (above map, below modals at 3000)**: mid-submit flows shouldn't be interrupted, but the banner still needs to be visible enough to get tapped. Modals naturally break on close; banner is there when the user is back at the map shell.
- **Service-worker events over polling a version endpoint**: polling would burn requests forever; the SW lifecycle already knows when an update is available. The `visibilitychange` hook plugs the only gap (idle tabs).
- **Kept `skipWaiting: true`**: in prompt mode the common pattern is `skipWaiting: false` so the SW waits for user action, but a user dismissing the banner shouldn't strand them on the old version indefinitely. With skipWaiting the new SW serves fresh assets in the background; the banner is a "reload now for the fresh JS bundle" UX nudge, not a guardrail.

---

## [Unreleased] - Avastuskaart stats + banner shortcut - 2026-04-18

### Changed 🔧
- 🟡 **Avastuskaart stats accordion is now independent of the map-mode toggle** (`src/components/ProfileDrawer.tsx`, `src/App.tsx`): users can expand the 15-maakond tile grid without actually turning on the map mode (which hides station prices). A new "stats row" button in the Avastuskaart panel — showing `X/Y jaama · X/Y valda · X/Y maakonda` with a chevron — toggles a local `statsExpanded` state. Tapping a tile while map mode is off auto-enables it before focusing (`onMaakondFocus` in App.tsx flips `showDiscoveryMap` to `true` first). Previously the grid was hard-gated behind the toggle, so curious users had to turn the map mode on just to see their progress, and lost their price view in the process.
- 🟡 **DiscoveryBanner body is now a tappable shortcut to Avastuskaart settings** (`src/components/DiscoveryBanner.tsx`, `src/App.tsx`): the icon + title + subtitle region is a `<button>` when the new `onOpenSettings` prop is provided. Tapping it opens the profile drawer, switches to the Profiil tab, auto-expands the stats accordion, and scrolls the Avastuskaart panel into view — plumbed via a `pendingAvastuskaartFocus` counter prop on `ProfileDrawer` so a `useEffect` fires the whole flow in one pass. Previously, changing which maakond was focused took 4+ taps (banner X to clear focus → profile → Profiil tab → scroll → new tile); now it's 1 tap to the drawer + 1 tile tap. The X (clear focus) and "Lülita välja" action buttons remain separate click targets. Viewing-someone-else state doesn't expose the shortcut (no self-settings to open).

### Key Decisions
- **Counter-prop over open-to-section prop**: using a monotonically incrementing `pendingAvastuskaartFocus` counter as the trigger means re-tapping the banner re-fires the scroll even if the drawer is already open (drawer-already-open is the most common path after first use). A `section?: 'avastuskaart'` string prop would need separate "consumed" tracking to avoid re-firing on every render.
- **50 ms `setTimeout` before `scrollIntoView`**: the profile tab's DOM hasn't mounted yet in the same tick the `useEffect` sets `activeTab='profile'`. A tick delay is cheaper than a layout-effect ref observer.
- **Auto-enable map mode on tile click instead of gating the tile**: a disabled-looking tile that says "turn on mode first" would have been worse UX — tiles that react are what users already expect from the visual language.

---

## [Unreleased] - Manual FAB icon simplified - 2026-04-18

### Changed 🔧
- 🟢 **Manual-entry FAB now uses plain Lucide `Fuel` icon** (`src/App.tsx`, `src/components/TutorialModal.tsx`, deleted `src/components/icons/FuelPencilIcon.tsx`): the custom pump+pencil composite icon is gone; the orange FAB and the tutorial legend both render the stock `Fuel` icon. The pencil overlay implied "edit existing data" when the button actually means "add new data"; the Fuel icon is also closer to what users already recognize from the Camera/Euro/Navigation/TrendingUp siblings (all single-glyph Lucide). Color token (`#fb923c`) unchanged — orange still distinguishes manual from the blue camera FAB.

---

## [Unreleased] - Tutorial back-button fix - 2026-04-18

### Fixed 🐛
- 🟡 **Tutorial "Valmis" no longer navigates off-site on first visit** (`src/App.tsx`): the LIFO overlay stack called `window.history.go(-1)` on every programmatic overlay close to unwind the matching `pushState`. On a fresh visit where the tutorial was the first (and only) overlay ever pushed, that rewind could land on the page the user had before `kyts.ee` — the final "Valmis" button appeared to act like a browser back button. Added an optional `skipRewind?: boolean` flag to overlay stack entries and marked the tutorial with it. The tutorial still registers a `pushState` on open (Android back button still closes it via `popstate`), but programmatic close via "Valmis" / "Jäta vahele" / backdrop / Esc skips the rewind. Trade-off: one stale history entry leaks per tutorial session, silently consumed by a future back press; vastly preferable to an off-site navigation.

---

## [Unreleased] - Logout button relocated - 2026-04-18

### Changed 🔧
- 🟢 **Logout moved from profile bottom to header icon + added confirm** (`src/components/ProfileDrawer.tsx`): the full-width "Logi välja" button at the bottom of the Profiil tab is gone; replaced by a small `LogOut` icon button in the header next to the X close button (only shown when a session exists). Frees vertical space in the drawer, keeps the control in a non-scrolling region, and distances it from high-touch content areas. Added a native `confirm()` ("Kas oled kindel, et soovid välja logida?") so accidental taps next to the X don't blow away someone's session.

---

## [Unreleased] - Cheapest-nearby price age - 2026-04-18

### Added ✨
- 🟢 **Cheapest-nearby rows now show price age** (`src/components/CheapestNearbyPanel.tsx`): each fuel row's metadata line (distance, "väljaspool raadiust") gains a compact "Xh tagasi" / "Xp tagasi" / "just nüüd" timestamp threaded from `prices.reported_at`. The fresh/vana pill already communicates the <24h threshold — this adds the exact recency so users can tell apart "2h old" from "22h old" at a glance when choosing between similarly-priced stations. Local `getTimeAgo` helper mirrors the format already used in ProfileDrawer — not lifted to `utils.ts` yet (one more caller before it's worth the move).

---

## [Unreleased] - Tutorial onboarding - 2026-04-17

### Added ✨
- 🟡 **First-run tutorial modal** (`src/components/TutorialModal.tsx`, wired into `src/App.tsx`, `src/components/GdprBanner.tsx`, `src/components/ProfileDrawer.tsx`): 5-card deck walks new users through welcome → FAB legend (all 5 buttons, color-coded) → 1 km submitter-proximity rule → gamification (leaderboard + Avastuskaart merged) → account perks (login CTA). Opens automatically ~400 ms after GDPR consent for first-visit users; for returning users who already accepted GDPR, fires once on mount if `kyts:tutorial-seen` is unset. Persisted via `localStorage['kyts:tutorial-seen'] = '1'`. Settings-tab "Ava tutvustus" button (above "Saada tagasisidet", both with `HelpCircle`/`MessageSquare` icons) lets anyone revisit. Keyboard nav: Esc = skip, Arrow keys = prev/next. Tappable step dots for direct jump. Registered in the LIFO overlay stack so Android back button closes it cleanly. A11y: `role="dialog"`, `aria-modal`, `aria-labelledby`, `aria-current="step"` on active dot, safe-area bottom inset on footer. PostHog events: `tutorial_started` (once per open), `tutorial_completed` / `tutorial_skipped` (with `last_step` prop).

### Key Decisions
- **Card deck over spotlight tour**: DOM-anchored coach marks are fragile on mobile (viewport rotation, FAB re-layout, scroll-offset drift) and would need per-step position math that ages badly. Card deck is a pure modal — zero coupling to actual UI coordinates, survives future FAB reshuffles.
- **Button nav only, no swipe gestures**: iOS Safari uses edge-swipe for back navigation; horizontal swipe-to-advance would collide with it. The tappable step dots give fast random access without a gesture layer.
- **Lucide icons color-matched to real FABs over screenshots**: a screenshot asset pipeline (capture → optimize → keep in sync as UI evolves) is ongoing tax. Inline icons reuse the exact `#3b82f6` / `#fb923c` / `#facc15` / `#a855f7` color tokens the FABs already use, so the visual cue transfers without a maintenance burden.
- **Split `onClose` and `onComplete` props**: lets the first-run path persist-and-analyze on close while the Settings-revisit path just closes without re-persisting — the revisit flow shouldn't keep firing `tutorial_completed` every time someone browses the tour.

### Iteration log (same day)
- 🟢 **"Jäta vahele" word order fixed** (was "Vahele jäta").
- 🟢 **Route planner correctly placed on the green FAB** — originally implied it lived in the top menu; the top menu only has the brand/fuel/freshness filter drawer.
- 🟢 **Login card leads with "works without an account too"** — anonymous users can already submit prices and vote (`user_id: user?.id || null` on both `prices` and `votes` insert paths). Account-only perks: favorites, leaderboard position, loyalty discounts, Avastuskaart progress, cross-device preference sync.
- 🟢 **Restructured 7 → 5 cards**: added a FAB-legend card (all 5 color-coded buttons in one row) and deleted the two per-FAB detail cards that duplicated it. Kept the 1 km proximity rule as a dedicated card because it's a real friction point at submit time, not a "button does X" fact. Merged leaderboard + Avastuskaart into one gamification card with both Trophy + Compass icons.

### Open Items
- Per-step analytics (currently only fire start/end) — defer until DAU grows enough to make step-drop-off data signal rather than noise.
- Cross-device sync of `kyts:tutorial-seen` via Supabase — a returning user on a new device gets the tutorial again; acceptable for now.
- Resume-from-last-step: closing mid-tour and reopening restarts at step 0. Deferred; re-entry is cheap since content is terse.

---

## [Unreleased] - User feedback channel - 2026-04-17

### Added ✨
- 🟢 **In-app user feedback** (`migrations/schema_phase33_feedback.sql`, `src/components/FeedbackModal.tsx`, wired into `src/components/ProfileDrawer.tsx` + `src/App.tsx`): new "Saada tagasisidet" button on the Seaded tab opens a minimal textarea modal. Submissions land in a new `feedback` Supabase table (insert-only from clients — RLS has no SELECT policy, so triage happens via the Supabase SQL editor). Attaches `user_id` when authed, captures the `user_agent` for platform-specific debugging. DB-layer `CHECK (char_length BETWEEN 3 AND 2000)` blocks dump attacks. PostHog events: `feedback_submitted` / `feedback_submit_failed`.

### Key Decisions
- **Supabase table over PostHog Surveys / GitHub Issues**: considered a PostHog survey (zero new infra but vendor-owned data + no public roadmap feel) and a hybrid "textarea POSTs to Vercel → creates GitHub Issue" (free triage but bot-PAT + spam surface). Went with the Supabase path because it owns the data, works for anon users, leaks no PAT, and the triage UI (the SQL editor) already exists in the stack.
- **No SELECT RLS policy at all** over a more elaborate admin view: you already use the Supabase dashboard daily for other tables — a custom admin UI would be pure ceremony until volume justifies it.

---

## [Unreleased] - Sentry inbox cleanup - 2026-04-17

### Fixed 🐛
- 🟡 **AI-scan body-read failures no longer escape the retry band** (`src/components/ManualPriceModal.tsx`): iOS Safari can truncate the response stream *after* the fetch headers arrive, throwing `TypeError: Load failed` inside `res.json()`. That was outside the inner try/catch, so it bypassed retries and surfaced as a raw Sentry error. Wrapped the body read in the same continue/NETWORK fallback the fetch already uses. Root cause of 7-event KYTS-WEB-7 cluster.
- 🟢 **Safari stale-chunk MIME variant now auto-reloads** (`src/App.tsx`, `src/main.tsx`): when Vercel serves `index.html` for a 404'd hashed asset after a deploy, Safari rejects the HTML with `'text/html' is not a valid JavaScript MIME type`. The existing `lazyWithReload` regex and Sentry `ignoreErrors` only caught the Chromium/Firefox wording (`Failed to fetch dynamically imported module`). Extended both with the Safari variant so affected iOS users get the same one-time auto-reload instead of a broken component. Root cause of KYTS-WEB-A and KYTS-WEB-C.

### Changed 🔧
- 🟢 **Retry-exhausted NETWORK/TIMEOUT errors no longer go to Sentry** (`src/components/ManualPriceModal.tsx`): extended the capture-skip set from `{QUOTA_EXCEEDED, AI_UPSTREAM_BUSY}` to also include `NETWORK` and `TIMEOUT`. Both are already retried (2 attempts) and surface user-facing error copy; a Sentry row for each client-side connection drop is noise, not signal. PostHog `ai_scan_failure` still tracks these for product analytics.

### Key Decisions
- **Fix root causes over ignoreErrors shotgun**: considered adding `/Load failed/i` globally to `ignoreErrors`, rejected it — too broad, would hide real Safari bugs in other code paths (Supabase calls, etc). Caught the symptom at the AI-scan call site where the retry logic already lives, so the classification stays localized.

---

## [Unreleased] - Clearable fuel preference - 2026-04-17

### Changed 🔧
- 🟢 **Fuel-type preference is now click-to-toggle** (`src/components/ProfileDrawer.tsx`): clicking the currently-selected fuel pill in Profile → Seaded → Sinu Auto Kütus now clears the preference (upserts `default_fuel_type = null`) instead of being a one-way set. Tooltip on the active pill hints at the behavior. Previously users had no way to unselect once chosen — they could only switch to a different fuel.

---

## [Unreleased] - Submitter-proximity gate + Mustakivi branding fix - 2026-04-17

### Added ✨
- 🔴 **1 km submitter-proximity gate on every price insert** (`src/components/ManualPriceModal.tsx`, `migrations/schema_phase31_price_proximity.sql`): closes the station-drawer abuse vector where anyone could report prices for any station in the country with no geographic constraint. Two new columns `submitted_lat`/`submitted_lon` ride along on every insert; a `BEFORE INSERT` trigger rejects inserts that omit them or sit more than 1 km from the station (spherical-law-of-cosines distance, no PostGIS / earthdistance dependency). RLS `prices_insert_validated` policy extended to require NOT NULL coords as defense in depth. Client adds `MAX_SUBMIT_KM = 1` constant, a new `captureLocationForStation()` that fires when the modal opens via the drawer "muuda hindu" flow, Estonian-language banners for the three new failure states (GPS pending / GPS error / too far from station), each with a "Värskenda" refresh button, and submit is disabled for all three. All three submit paths (station drawer, camera FAB, manual FAB) now block on the same rule. Commit `fb0c1e3`.
- 🟢 **Phase 32: Mustakivi tee Neste → Alexela data fix** (`migrations/schema_phase32_mustakivi_alexela.sql`): one specific station in Lasnamäe, Tallinn was mis-branded by OSM upstream. Promoted to Alexela so it picks up the brand filter, loyalty discounts, and Alexela-chain styling. Tight `WHERE` (Neste + Mustakivi street + Tallinn bbox) matched exactly one row; trailing `SELECT` confirms. Migration run directly in Supabase SQL editor. Not yet committed.

### Changed 🔧
- 🟡 **FAB picker fallback radius 5 km → 1 km** (`src/components/ManualPriceModal.tsx`): the 5 km fallback was introduced in commit `4022be2` yesterday as GPS-skew headroom after a friend's canopy-multipath incident stranded them at 500 m. With the server now rejecting anything beyond 1 km, the fallback must match — otherwise the picker would offer stations the server will reject. Picker copy ("5km raadiuses" → "1km raadiuses") follows. Tight-radius 0.5 km auto-select path unchanged. The "Värskenda" button already exists in the picker as the safety valve when GPS is off.

### Key Decisions
- **Unified 1 km cap over per-path tolerance**: considered (a) 1 km drawer + 5 km FAB picker + 2 km server buffer, vs (b) 1 km everywhere. Went with (b) — the whole point of the client check is to match the server; having the picker offer stations the server rejects would just move the rejection from the picker to the submit button and confuse users. The recent 5 km headroom is a real loss for canopy-multipath edge cases but can be re-widened later if Sentry shows real users blocked.
- **Spherical-law-of-cosines over PostGIS**: at Estonian latitudes the accuracy gap vs great-circle is <10 m — comfortably inside a 1 km gate. Avoiding the extension keeps the migration portable across Supabase projects and doesn't require any role beyond the default `authenticator`.
- **`nullable` columns + trigger enforcement over `NOT NULL` constraint**: lets historical rows (which have no lat/lon) stay valid without a backfill, while the trigger still guarantees every *new* row has both coords.

### Open Items
- **Phase 32 migration not yet committed to git** — ran in Supabase, file exists locally. Bundle into the next commit.
- **Sentry watch**: look for `submitted_lat/submitted_lon required` or `submitter is X.XX km from station` trigger errors in the first 24 h post-deploy. A spike means users on stale client bundles (shouldn't happen given NetworkFirst HTML + `skipWaiting`, but worth eyeballing).
- **5 km → 1 km tradeoff accepted** — if real users legitimately at a station get blocked by GPS skew, reconsider widening the picker back to 2–3 km while keeping the server cap at 1 km. The server trigger becomes the single source of truth; the picker just stops offering obvious-reject candidates.
- **GPS-denied users can no longer submit** at all (hard block). Alternative was a flagged "manual_no_gps" entry_method for audit; deferred unless real users complain.

---

## [Unreleased] - AI scan stability: Node handler + cross-origin + radius - 2026-04-16

### Fixed 🐛
- 🔴 **AI scan 100% broken since edge→node runtime switch** (`api/parse-prices.ts`): every `POST /api/parse-prices` was returning `FUNCTION_INVOCATION_FAILED` — Vercel's generic `text/plain` 500. Root cause: when `661d7d2` flipped `runtime: 'edge'` → `'nodejs'`, the handler body stayed Web Fetch–style (`req.headers.get(...)`, `req.json()`, `new Response(...)`). Vercel's classic Node runtime uses Node-style `(req, res)` where `req.headers` is a plain object with no `.get()` method. First rate-limit line threw a `TypeError` at cold start, crashing the function before any response could be written. Rewrote handler using Node-style signature — `req.headers['x-forwarded-for']`, parse `req.body` (Vercel auto-parses JSON), return via `res.status(N).json(...)`. Same rate limits, same Gemini call, same JSON contract to the client. Commit `f54963f`.
- 🟡 **"Ei leitud ühtegi tankla 500m raadiuses" dead-end on FAB scan** (`src/components/ManualPriceModal.tsx`): friend was physically standing next to an Olerex but GPS skewed >500m (cold PWA fix + fuel-canopy multipath). Old code set `NO_NEARBY_STATION` and blocked with only a retry button — no recovery. Replaced with a tiered radius: 0.5km tight (unchanged auto-select for unambiguous match), 0.5–5km fallback that surfaces the picker so user confirms, >5km still blocks with revised copy pointing to GPS/manual selection. Picker already renders per-candidate distance ("780m" / "1.4km"). Commit `4022be2`.
- 🟡 **Mobile Safari "TypeError: Load failed" on POSTs from www.kyts.ee** (`index.html`, Sentry KYTS-WEB-7/-8): friend's friend opened the app from `https://www.kyts.ee/` (old bookmark pre-apex-swap). Vercel 308-redirects that to apex. Same-origin `fetch('/api/parse-prices', ...)` hit the redirect, and Safari couldn't re-preflight a cross-origin POST with `Content-Type: application/json` on the redirected destination → fetch aborted sub-second. 5 events over ~4 minutes. Added a tiny boot-time `<script>` before `main.tsx`: if hostname is `www.kyts.ee`, `location.replace('https://kyts.ee' + path + search + hash)`. All subsequent `/api/*` calls now live on apex as same-origin. Commit `a5f25c8`.

### Key Decisions
- **Node-style over re-investigating Web-Fetch-on-Node support**: Vercel technically supports Web Fetch handlers on Node runtime via a newer Fluid Compute path, but our setup clearly doesn't resolve to that mode (the crash proved it). Node-style `(req, res)` is the well-trodden path and the rewrite touched fewer than 35 lines. Not worth a config excursion.
- **5km fallback over tighter-then-error**: GPS is unreliable at fuel stations; better to offer a distance-labeled picker than block users who are actually present. Auto-select preserved for the tight-radius happy path keeps the fast flow for good-GPS users.
- **Apex-force at client boot over server-side redirect exclusion**: Vercel's www→apex 308 is set at the domain-manager level and applies to all paths; can't easily carve out `/api/*`. A 3-line script in `index.html` runs before any fetch and fixes the problem for every user regardless of how they arrived.

### Sentry Observations (14-day window)
- **KYTS-WEB-7 (×4) + -8 (×1)** unresolved → should self-resolve after `a5f25c8` deploys; watching.
- **KYTS-WEB-5/-6** resolved by the Node runtime switch yesterday (and subsequently the re-fix above).
- **KYTS-WEB-4/-3** ignored — stale `kutuse-kaart.vercel.app` chunk-load failures from the old preview domain; harmless.
- **KYTS-WEB-2** ignored — single "Error: Rejected", no recurrence.
- **KYTS-WEB-1** ignored — the initial smoke test.

### Open Items
- **Verify KYTS-WEB-7/-8 stop firing** once `a5f25c8` has been live for 24h; resolve if clean.
- **Sentry `userCount=0` on every issue** — user IDs not yet wired into Sentry. Low-priority observability gap; revisit when user base grows.
- **Friend reported retry worked after first failure** — either deploy landed between attempts or one-off Safari/5G hiccup. Fix stands either way (strictly better than before).

---

## [Unreleased] - GitHub Issues #1/#2 triage + LICENSE - 2026-04-16

### Fixed 🐛
- 🔴 **Logout leaked profile preferences into anonymous state** (`src/App.tsx`, issue #2): `loadData`'s signed-out branch only cleared favorites / defaultFuelType / preferredBrands — leaving `hideEmptyDots`, `showClusters`, `dotStyle`, `showLatvianStations`, `applyLoyalty`, `displayName`, and `loyaltyDiscounts` stuck at whatever the user had while logged in. Since each `useState` initializer also reads its own localStorage cache, the stale values re-applied on every page load. Anonymous visitors saw the previous account holder's "hide inactive dots" toggle persist across logout. Reset every server-synced setting to its anonymous default and wipe the matching localStorage keys when the session is null. Also explains the reported flakiness — races between localStorage-first render and async `onAuthStateChange` exposed the stale window before the profile load replaced it. Commit `a56e21a`, closes #2.
- 🟡 **FAB buttons too see-through over busy map content** (`src/App.tsx`, `src/index.css`, issue #1): original FABs used `rgba(255,255,255,0.06)` + `blur(12px)` via `.glass-fab` class. Fine over calm basemap (like the top fuel-type pills) but colored station dots panning underneath made the icons unreadable. After several iterations (opaque pill-bg + sheen → 45% milky → 55% dark slate → blur(60px) scatter), settled on **matching the top pills byte-for-byte**: dropped the `.glass-fab` class entirely and inlined the same `var(--color-surface-alpha-06)` + `blur(12px)` + `var(--color-surface-alpha-12)` border directly on each FAB. DevTools now shows identical computed styles for FABs and pills. Over calm map they render identically; over colored dots they're see-through — accepted trade-off. Commit `7d10adf`, closes #1.

### Added ✨
- 🟢 **LICENSE file** (`LICENSE`): All Rights Reserved, personal-viewing only (viewing + forking for study allowed, redistribution + commercial use forbidden). Clarifies reuse terms now that the repo is public. Commit `857c22e`.

### Key Decisions
- **Repo stays public, not private**: transparency + issue-tracking-via-GitHub ergonomics outweigh the minor "nobody sees my half-baked experiments" benefit of private. Licensing covers legal reuse concerns.
- **Git-history audit found no real secrets leaked**: `.env` was tracked in three early commits (`606a0b5`, `c51d72e`, `aa3623f`) but only contained `VITE_SUPABASE_URL` + publishable anon key (`sb_publishable_...`) — both public-by-design (VITE_ vars are inlined into the client bundle at build time anyway). Service role key, Gemini API key, Upstash tokens, Sentry token all only in Vercel env + local `.env` (gitignored), never committed.
- **Pill-match over readability for FABs**: user explicitly preferred visual consistency with the top fuel-type pills over icon legibility over busy map content. Spent ~10 iterations attempting to give FABs their own glassy character (frosted/sea-glass/milky) before settling on the byte-identical pill recipe — the "glass" reads differently between FABs and pills regardless because of what sits behind them, not because of CSS.

### GitHub Issues Workflow
- **Issues #1 and #2 filed and closed this session** — first real end-to-end use of the Issue-Templates-based workflow set up yesterday. `Closes #N` in commit messages auto-closed both on push.

### Open Items
- **Users on desktop Brave need a one-time localStorage cleanup** to recover from the stale-preferences bug: Application tab → Local Storage → `https://kyts.ee` → delete `kyts-hide-empty-dots`, `kyts-show-clusters`, `kyts-show-latvian-stations`, `kyts-dot-style`, `kyts-apply-loyalty`, `kyts-loyalty-discounts`. After that, future logouts self-clean.
- **`.glass-fab` CSS rule now unused** — removed from `src/index.css`. `.frosted-pill` sibling rule kept but still unused anywhere; safe to leave for now, can drop in a future cleanup pass.

---

## [Unreleased] - Feedback.md round 2 + PWA update propagation - 2026-04-16

### Fixed 🐛
- 🔴 **AI scan "Failed to fetch" on desktop** (`api/parse-prices.ts`, `src/components/ManualPriceModal.tsx`): Sentry KYTS-WEB-5/-6 showed repeated `TypeError: Failed to fetch` on `POST /api/parse-prices` with no HTTP status — connection killed mid-Gemini-call. Root cause: Edge runtime's 25s ceiling vs Gemini 2.5 Flash vision p99 ~30–40s. Switched the endpoint to Node serverless (`runtime: 'nodejs'`, `maxDuration: 60`). Client side added a 55s `AbortController` with dedicated `TIMEOUT`/`NETWORK` error codes + Estonian copy — no more silent "AI lugemine ebaõnnestus" when the real cause was a timeout.
- 🟡 **Back button closing the whole price modal** (`src/App.tsx`, `src/components/ManualPriceModal.tsx`): `photoExpanded` was local state so popstate popped the outer `priceModal` instead of the zoom. Lifted to `App.tsx`, registered in `overlayStackRef` as `photoZoom`. Back now closes zoom → second back closes modal.
- 🔴 **Installed PWA serving stale cache for days** (`vite.config.ts`): `registerType: 'autoUpdate'` downloaded the new SW but without `skipWaiting` it stayed in "waiting" until every client closed — installed PWAs on mobile rarely fully close. Added Workbox `skipWaiting` + `clientsClaim` + `cleanupOutdatedCaches` + NetworkFirst navigation fallback (4s network timeout on HTML). New deploys now reach users within one launch; old cache entries are wiped on activation.
- 🔴 **Build failure on Vercel** (`api/parse-prices.ts`): `runtime: 'nodejs20.x'` rejected — Vercel only accepts `edge`/`experimental-edge`/`nodejs`. Fixed (`9bbd82e`).

### Added ✨
- 🟡 **"Laadi pilt" gallery-upload button** (`src/components/ManualPriceModal.tsx`): second file input without `capture="environment"` so users with a totem photo already in their gallery (or desktop users with no camera) get a logical path. Only rendered in the station-selected "muuda hindu" flow — the camera FAB stays a single-purpose scan button. Layout: upload on left, camera on right.

### Sentry Access
- 🟢 User generated a personal auth token with `project:read` + `event:read` + `org:read`, added to `.env` as `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`. Confirmed working via `sentry.io/api/0/organizations/$ORG/issues/:id/events/latest/`. Organization Auth Token (create-only, CI/release scopes) deleted as unused.

### Key Decisions
- **Node runtime over Edge for Gemini-backed endpoints**: Edge's 25s cap is too tight for vision models; Node serverless maxDuration 60s on Hobby gives 2× safety margin with no ergonomic downside for this endpoint (Upstash Redis works identically in both runtimes).
- **Upload button not in FAB mode**: the camera FAB is designed for live totem scans — offering a gallery picker there muddies the flow. Two buttons in the station-selected form only.
- **skipWaiting over prompt-to-update UX**: for a 5-star fuel-price app with daily redeploys, a forced-update SW beats a "new version available" banner that users dismiss. Data loss risk is zero (no in-flight form is orphaned by the swap).

### Open Items
- **One-time nudge for already-installed PWAs**: users stuck on the pre-`de5a35f` SW need to either reinstall (iOS: delete & re-add home-screen icon) or clear app storage (Android Chrome) once. After that, all future updates propagate automatically.
- Watch Sentry for a week — KYTS-WEB-5/-6 pattern should stop. If not, Gemini is likely >60s and we need to downshift to a smaller model or pre-classify the image.
- Feedback.md could be cleared — all 5 items addressed this session and last. Leaving to user discretion.

---

## [Unreleased] - Latvia border-strip stations + user toggle - 2026-04-15

### Added ✨
- 🟡 **Latvian border-strip stations seeded** (`scripts/seed_latvia_border.js`, `migrations/schema_phase26_stations_country.sql`): 75 fuel stations from a ~20km strip south of the Estonia-Latvia border pulled via Overpass API (`area["name"="Latvija"]` + bbox `57.30,21.50,57.90,27.50`), upserted on `(latitude,longitude)` with `country='LV'`. New `stations.country` column defaults to `'EE'` (all existing rows backfilled implicitly). Reversible with one SQL line: `delete from stations where country='LV';`. Seed script is idempotent — safe to re-run.
- 🟢 **Latvian chain canonicalization** (`src/utils.ts`): added 8 chains to `CHAIN_PATTERNS` — Virši-A, Viada, KOOL, Astarte Nafta, Latvijas Nafta, Latvijas Propāna Gāze, Lateva, Gotika Auto. Covers most of the seeded border inventory; unmatched names fall through to their raw form.
- 🟡 **"Näita Läti jaamu" map toggle** (`migrations/schema_phase27_show_latvian_stations.sql`, `src/App.tsx`, `src/components/ProfileDrawer.tsx`): Profile → Seaded → Kuva gets a toggle to show/hide Latvian stations, **default on**. New `user_profiles.show_latvian_stations boolean not null default true` persists choice across devices; localStorage mirror keeps it snappy for anon users. Filter runs inside `filteredStations` useMemo alongside the brand filter — only affects the Map; CheapestNearby/Statistics/ProfileDrawer still see all stations (intentional — stats and favorites shouldn't silently drop rows).

### Key Decisions
- **Separate `country` column over separate tables**: keeps one `stations` table so brand canonicalization, price queries, and favorites don't fork. Promoting Latvia/Lithuania into proper regions later is a filter flip, not a migration.
- **Bbox + Latvia area-filter guards against cross-border bleed**: bbox alone would grab Valga/Valka's Estonian side; the `area["name"="Latvija"]` clause ensures LV-only rows.
- **Default ON, per-user opt-out**: most users drive near the border at least occasionally; those who never do can hide the clutter.

### Migrations to Apply
- `migrations/schema_phase26_stations_country.sql` — applied when Latvian stations were seeded.
- `migrations/schema_phase27_show_latvian_stations.sql` — **pending**, run in Supabase SQL editor.

### Open Items
- Confirm 13 of 75 Latvian stations have usable display names (same "nameless OSM node" issue as the Estonian seed — fall-through to operator/name works, a few still label as "Tundmatu").
- Price-reporting UX from the LV side is untested — no pricing flow for Latvian fuel units yet; users can submit but station names and brands are the immediate payoff.

---

## [Unreleased] - iOS PWA session-loss fix via apex↔www swap - 2026-04-15

### Fixed 🐛
- 🔴 **iOS installed-PWA silent logout on "close" tap**: Vercel primary was `www.kyts.ee` with `kyts.ee` → 307 → www. Friend on iOS installed the PWA from `kyts.ee`, which locked the manifest scope to apex. Every launch hit the redirect out of scope → iOS rendered its "you left the app" Safari-style header with an X → tapping X tore down the standalone webview and wiped the session. Regular Safari was unaffected because Safari doesn't enforce manifest scope. **Fix:** Vercel Settings → Domains — made `kyts.ee` (apex) Production, set `www.kyts.ee` to 308 Permanent Redirect → `kyts.ee`. Verified: apex returns 200, www returns 308 with `location: https://kyts.ee/`.

### Notes
- **DNS Change Recommended badges in Vercel**: Vercel is rolling out a new IP range (`216.198.79.1` for apex A, per-project CNAME like `68532625e01bd565.vercel-dns-017.com` for www). Current records (`76.76.21.21` + `cname.vercel-dns.com`) still resolve correctly. Deferred — no urgency, will handle as its own focused change later.
- **iOS PWA reinstall required** for users already on the home screen: delete old icon, revisit `https://kyts.ee`, Add to Home Screen again. Re-scopes the PWA to the (now consistently-serving) apex.

### Open Items
- Confirm with friend that after reinstall, the iOS PWA session persists across launches and no X badge appears.
- DNS IP range migration (recommended by Vercel, not urgent).

---

## [Unreleased] - Leaderboard top 100 + Feedback.md triage - 2026-04-15

### Changed 🔧
- 🟢 **Edetabel: top 50 → top 100** (`src/components/LeaderboardDrawer.tsx`): Client-side `.limit(50)` → `.limit(100)` to show more community contributors. Supabase views `v_leaderboard_*` already capped at 100, no migration needed. Drawer list is already scrollable at 85vh.

### Notes
- **Messenger rich preview** (Feedback #3): confirmed resolved by the kyts.ee launch OG tags below. Facebook Sharing Debugger re-scraped successfully; re-sharing the link now renders title + logo + description. Missing `fb:app_id` warning intentionally skipped (we're on PostHog, not FB Insights).
- **Multi-language EN** (Feedback #1): deferred to its own dedicated plan. Decisions captured for that plan: build for multiple languages from day 1 (extensible to RU/FI/LV later), translate both Terms + Privacy to English. Open for future plan: library choice + auto-detect vs toggle-only.

### Dashboard Setup Done This Session
- Sentry → Security & Privacy → **Allowed Domains**: added `kyts.ee` + `www.kyts.ee` (+ kept old `kutuse-kaart.vercel.app` during transition).

---

## [Unreleased] - Custom domain launch (kyts.ee) - 2026-04-15

### Added ✨
- 🟡 **Open Graph + Twitter card meta tags** (`index.html`): og:type/title/description/url/image/locale + twitter:card. Social previews now render correctly when `https://kyts.ee` is shared.
- 🟡 **Canonical link** (`index.html`): `<link rel="canonical" href="https://kyts.ee/">` for SEO consolidation across `kyts.ee` / `www.kyts.ee` / old `*.vercel.app`.
- 🟢 **Meta description + theme-color** (`index.html`): Estonian description copy; theme-color `#0a0a0a` for mobile browser chrome.

### Changed 🔧
- 🔴 **PWA manifest rebranded + identity stabilized** (`vite.config.ts`): `name` "KütuseKaart" → "Kyts — Kütusehinnad", `short_name` → "Kyts", Estonian `description`, added `id: '/'`, `start_url: '/'`, `scope: '/'`, `lang: 'et'`. The `id` field keys the install to a stable path so existing PWA installs aren't orphaned when the origin changes.
- 🟡 **HTML lang attribute** (`index.html`): `lang="en"` → `lang="et"` (content is entirely Estonian; fixes screen readers + search indexing).
- 🟡 **HTML title** (`index.html`): `kytuse_kaart` → "Kyts — Eesti kütusehinnad".
- 🟢 **README live URL** (`README.md`): now points to `https://kyts.ee` instead of `kutuse-kaart.vercel.app`.

### Dashboard Setup (user tasks this session)
- DNS at veebimajutus.ee: added A `kyts.ee` → `76.76.21.21` and CNAME `www` → `cname.vercel-dns.com`; removed conflicting default A (`185.7.252.153`) and CNAME (`www` → `kyts.ee`). Email records (MX, SPF, DMARC, DKIM, elkdata, ftp, autoconfig) kept intact.
- Supabase → Auth → URL Configuration: Site URL `https://kyts.ee` + Redirect URLs `https://kyts.ee/**`, `https://www.kyts.ee/**`.
- Google Cloud Console → OAuth 2.0 Client: Authorised JavaScript origins for `https://kyts.ee` + `https://www.kyts.ee`. Client ID cross-verified against Supabase.

### Open Items
- **Sentry allowed domains** — add `kyts.ee` + `www.kyts.ee` in Project Settings → Security & Privacy → Allowed Domains once DNS propagates. Not code.
- DNS still propagating at time of commit — verification happens once Vercel flips both domains to "Valid Configuration".
- Old `kutuse-kaart.vercel.app` deployment still live as a redundancy; plan to leave as 301 redirect to `kyts.ee` for ~1 month.

---

## [Unreleased] - Ops, Legal & Analytics Hardening - 2026-04-15

### Added ✨
- 🔴 **Upstash Redis rate limiting on `/api/parse-prices`** (`api/parse-prices.ts`): 10 req/min per-IP sliding window + 1000 req/day global fixed window. Protects Gemini budget from abuse. Graceful no-op when Upstash env absent (local dev). Verified with hammer test: reqs 11–13 returned `429 + Retry-After`.
- 🟡 **Sentry error monitoring** (`src/main.tsx`): `@sentry/react` init with `VITE_SENTRY_DSN`, 10% trace sampling, replays disabled (would require consent banner). Wrapped `<App />` in `Sentry.ErrorBoundary` with Estonian fallback UI. Graceful no-op when DSN absent.
- 🟡 **PostHog cookieless analytics** (`src/utils/analytics.ts`, `src/main.tsx`, `src/components/ManualPriceModal.tsx`): EU Cloud (`eu.i.posthog.com`), `persistence: 'memory'`, autocapture/session-replay/surveys all off. No cookies, no localStorage — legally exempt from consent banner. Manual `capture()` calls on `ai_scan_success` and `price_submitted`. Opt-out helper reads `kyts:analytics-opt-out` localStorage flag for a future Settings toggle.
- 🔴 **Terms of Service** (`src/components/TermsModal.tsx`): New modal covering service description (as-is, user-sourced), prohibited conduct (fake prices, scraping, commercial use without permission), liability cap, donations clause (no special rights, non-refundable), Estonian jurisdiction (Harju Maakohus). Cross-linked to Privacy.
- 🟢 **Git safety tag** `v1.4.0-stable` on commit `4c592ef` — rollback anchor before ops hardening began.
- 🟢 **`Notes/operations.md`** — rate limit setup, Redis prefix semantics, usage alert procedures, Sentry verification steps, rollback workflow.

### Changed 🔧
- 🔴 **Privacy Policy rewritten** (`src/components/PrivacyModal.tsx`): Now identifies data controller (Mikk Rosin, kyts@mikkrosin.ee, www.kyts.ee), lists all sub-processors (Supabase, Vercel, Google, Upstash, Sentry, PostHog), adds retention periods, GDPR legal bases (art 6(1)(b) + (f)), and complaint route (aki.ee). Old text claimed cookies were used for tracking — corrected to reflect cookieless analytics.
- 🟡 **GDPR banner copy** (`src/components/GdprBanner.tsx`): Replaced separate "Privaatsuspoliitika" button with inline links to both Kasutustingimused and Privaatsuspoliitika in banner text. Single "Nõustun" button.
- 🟡 **Profile drawer footer** (`src/components/ProfileDrawer.tsx`): Added legal links row (Kasutustingimused · Privaatsuspoliitika) above Logi välja; new optional `onOpenPrivacy` / `onOpenTerms` props.

### Key Decisions
- **PostHog cookieless over Microsoft Clarity**: Clarity requires a consent banner (session recording + cookies). PostHog in memory-persistence mode needs no consent — better UX.
- **No session replays anywhere**: Sentry + PostHog both explicitly disabled. Consent-banner-free policy only holds if no service records sessions.
- **Entity-neutral legal docs**: Controller is private individual (Mikk Rosin). Docs can swap to MTÜ/OÜ later by editing a single line — no full rewrite.
- **Vercel Hobby is our failure mode, not billing risk**: Hobby hard-caps at limits (site stops serving, no overage bill). Spend Management is Pro-only but unnecessary. Watch for the 75% usage email as the manual upgrade signal.
- **Gemini budget alert is the real money backstop**: €5/mo budget in Google Cloud Billing with alerts at 50/90/100% — rate limits protect against abuse, budget protects against bugs.
- **Buy Me a Coffee (upcoming #9) chosen over backend-routed donations**: No legal entity required. Bypasses Vercel Hobby's commercial-use clause because money never touches our infra.

### Open Items
- **#9 Donate button** — not yet built. Needs `buymeacoffee.com/kyts` account, then modal wires as external link.
- **PostHog Settings opt-out toggle** — helpers exist (`setAnalyticsOptOut`, `isAnalyticsOptedOut`) but no UI. Not legally required (cookieless), nice-to-have.
- **Upstash + PostHog usage alerts skipped** — both free tiers self-cap. Only Vercel (auto-email at 75/90%) and Gemini (manual €5 budget) alerts are actually wired.

### Dashboard Setup Done This Session
- Upstash Redis database (EU region) — creds in Vercel env.
- Sentry project `kyts-web` (React) — DSN in Vercel env.
- PostHog EU Cloud project — Product Analytics + Web Analytics only, autocapture/heatmaps/session replay OFF. Key in Vercel env.
- Google Cloud Billing budget €5/mo with 50/90/100% alerts on the Gemini project.

### New Vercel Environment Variables
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `VITE_SENTRY_DSN`
- `VITE_POSTHOG_KEY`

### File Impact
- **New**: `src/components/TermsModal.tsx`, `src/utils/analytics.ts`, `Notes/operations.md`
- **Modified**: `api/parse-prices.ts`, `src/main.tsx`, `src/App.tsx`, `src/components/PrivacyModal.tsx`, `src/components/GdprBanner.tsx`, `src/components/ProfileDrawer.tsx`, `src/components/ManualPriceModal.tsx`, `package.json`, `package-lock.json`
- **New deps**: `@upstash/ratelimit`, `@upstash/redis`, `@sentry/react`, `posthog-js`
- **New git tag**: `v1.4.0-stable`

---

## [Unreleased] - Desktop Click Reliability, Route Planner UX & Station Names - 2026-04-13

### Fixed 🐛
- 🔴 **Multi-click required to open station drawer** (`Map.tsx`): Every render rebuilt Leaflet icon instances and `eventHandlers` closures, causing react-leaflet to detach/reattach click listeners and `setIcon()` to rebuild DOM nodes — clicks landing during the gap were dropped (worst on desktop). Replaced with memoized icon caches (`fadedIconCache`, `freshIconCache`, `pillIconCacheRef`, `clusterIconCache`) keyed on visual state, plus a single map-level click delegate that resolves the station via `data-sid` attributes embedded in the DivIcon HTML. Single click is now reliable for dots, pills, clusters, and de-clustered markers.
- 🔴 **Cluster-mode click flakiness** (`Map.tsx`): Replaced `react-leaflet-cluster` with an imperative `ClusterLayer` that owns `L.markerClusterGroup` directly and diffs markers by id. Bypasses React reconciliation churn that was tearing down marker layers mid-interaction.
- 🟡 **CheapestNearbyPanel false timeout error on reopen** (`CheapestNearbyPanel.tsx`, `App.tsx`): Brave on desktop delayed the second permission prompt past our 8s timeout, surfacing a stale `POSITION_UNAVAILABLE`. Now the Map shares its actively-tracked GPS as `fallbackLocation`; the panel uses it immediately on open and silently refreshes in the background.
- 🟡 **Route planner polyline cleared on close, then lost on reopen** (`RoutePlanModal.tsx`, `App.tsx`): Modal unmounted on close and dropped its route. Added `routeMounted` flag in `App.tsx` so the modal stays mounted after first open; the X-cancel FAB resets it for a clean reopen.
- 🟢 **Station names show "Tundmatu" for unbranded OSM nodes** (`utils.ts`, `scripts/seed_stations.js`): `getStationDisplayName` now treats "Tundmatu" as a placeholder and substitutes `amenities.name` or `amenities.operator`. Seed script's brand-name fallback chain now also tries `operator` before defaulting.

### Changed 🔧
- 🟡 **Route planner: type-to-search after selection** (`RoutePlanModal.tsx`): Removed the `!destination` guard on the search dropdown and added a "skip search when query equals current destination's first segment" rule, so retyping naturally reopens the dropdown without re-querying for the already-selected place.
- 🟡 **Route planner: removed redundant "muuda" button** (`RoutePlanModal.tsx`): Search field is always editable now.
- 🟡 **Route planner: X clear button in search field** (`RoutePlanModal.tsx`): One-tap clear of query, hits, destination, and route.
- 🟢 **Removed EV pipeline entirely** (per Feedback.md item 4): Deleted `api/sync-ev-chargers.ts`, `api/sync-ev-prices.ts`; stripped EV branches from `App.tsx`, `Map.tsx`, `utils.ts`; new `schema_phase17_drop_ev.sql` drops `ev_prices` + `ev_chargers` tables.

### Key Decisions
- Map-level click delegation via `data-sid` is more reliable than per-marker react-leaflet `eventHandlers` for high-marker-count maps that re-render frequently
- Imperative ClusterLayer beats react-leaflet-cluster for our usage — too many React-driven marker changes per state update
- Keep fresh-prices-only filter in route planner (user preference); fix silent failures, not the rule
- "Tundmatu" is a placeholder, not a real station name — prefer any OSM-known label over showing it

### Open Items
- 13 stations remain literally nameless in OSM (no `brand`, `name`, or `operator`). Either label them manually in app/DB or contribute to OSM. Gemini identified one as Neste (Ahtme mnt, Kohtla-Järve) — applied via `schema_phase20_unknown_targeted.sql`.
- Vercel cron jobs for `/api/sync-ev-chargers` and `/api/sync-ev-prices` need manual deletion in dashboard after deploy

### Database Migrations
- `schema_phase17_drop_ev.sql`: Drops `ev_prices` and `ev_chargers` tables.
- `schema_phase18_ruhnu_name.sql`: Names "Ruhnu sadama tankla" by lat/lon bbox.
- `schema_phase19_list_unknown.sql`: Audit query + auto-promote stations whose `amenities` already has a name/operator.
- `schema_phase20_unknown_targeted.sql`: Per-id renames for stations identified via lookup (Eksar-Transoil, Eesti Autogaas, Alexela, Neste).

### File Impact
- **New**: `migrations/schema_phase17_drop_ev.sql`, `schema_phase18_ruhnu_name.sql`, `schema_phase19_list_unknown.sql`, `schema_phase20_unknown_targeted.sql`
- **Modified**: `src/components/Map.tsx`, `src/components/RoutePlanModal.tsx`, `src/components/CheapestNearbyPanel.tsx`, `src/App.tsx`, `src/utils.ts`, `scripts/seed_stations.js`
- **Deleted**: `api/sync-ev-chargers.ts`, `api/sync-ev-prices.ts`

---

## [v1.5.0] - Brand Preferences, Profile Redesign & Back Button - 2026-04-09

### Added 🚀
- 🔴 **Preferred Station Brands** (`ProfileDrawer.tsx`, `CheapestNearbyPanel.tsx`): Users can select preferred fuel station brands (e.g. Circle K, Neste) in their profile. The "Cheapest Nearby" driving mode panel then only shows results from those brands. Empty selection shows all (default). Persisted via `preferred_brands text[]` column in `user_profiles`.
- 🔴 **Mobile Back Button Handling** (`App.tsx`): The phone's back button now closes the topmost overlay (drawers, modals, camera, panels) instead of navigating away from the PWA. Single centralized `popstate` handler with ref-based state avoids race conditions.
- 🟡 **Tap-to-Expand Photo Thumbnail** (`ManualPriceModal.tsx`): Tapping the captured photo thumbnail opens a full-screen overlay showing the image at full resolution — essential for reading prices when AI fails and manual entry is needed.

### Changed 🔧
- 🟡 **Profile Page Redesign** (`ProfileDrawer.tsx`): Reordered sections so favorites are immediately visible (no scrolling past settings). Fuel type + preferred brands merged into a collapsible "Seaded" section with a compact 3-column brand grid and inline summary when collapsed (e.g. "Bensiin 95 · 3 ketti").
- 🟡 **Camera FAB Station Radius** (`ManualPriceModal.tsx`): Replaced cascading 500m/5km/unlimited search with a fixed 500m radius matching realistic photo distance (accounts for GPS lag while driving past). Shows clear Estonian error message when no stations are in range.

### Key Decisions
- 500m radius for camera auto-select: realistic for flagship phone zoom + GPS lag buffer at city speed
- Preferred brands filter applies only to driving mode panel, not the map
- Profile page prioritizes favorites (viewed often) over settings (configured once)
- Back button uses overlay count tracking + refs instead of per-overlay hooks (reliability)

### Open Items
- Back button reliability needs real-world testing across devices
- `CameraModal.tsx` dead stub still exists — can be deleted
- Free-tier Gemini quota is 20 requests/day

### Database Migrations
- `schema_phase11.sql`: Adds `preferred_brands text[] DEFAULT '{}'` column to `user_profiles`.

### File Impact
- **New**: `schema_phase11.sql`
- **Modified**: `src/App.tsx`, `src/components/ManualPriceModal.tsx`, `src/components/ProfileDrawer.tsx`, `src/components/CheapestNearbyPanel.tsx`, `src/utils.ts`

---

## [v1.4.0] - Driving Mode, Camera FAB & AI Resilience - 2026-04-08

### Added 🚀
- 🔴 **Cheapest Nearby Panel** (`CheapestNearbyPanel.tsx`): New "driving mode" panel (⚡ FAB) showing the cheapest station per fuel type (95, 98, Diesel, LPG) within a configurable radius (5/10/20 km). Each result includes price, distance, station name, and a one-tap **Navigate** button that opens Google Maps directions. Auto-opens on app start when geolocation is available.
- 🔴 **Camera FAB** (`App.tsx`): Persistent camera button on the main map lets users scan prices without first finding a station. Opens ManualPriceModal in "stationless" mode.
- 🔴 **GPS + AI Auto-Station-Select** (`ManualPriceModal.tsx`): When scanning via camera FAB, the app uses geolocation + the AI-detected brand name to automatically select the nearest matching station within 500 m. Shows a picker if multiple candidates exist.
- 🟡 **Progressive Price Pill Reveal** (`Map.tsx`): Top-5 cheapest stations for the selected fuel type now show price pills at every zoom level — not just when zoomed past level 12.
- 🟡 **Auto-Open Nearby Toggle**: Logged-in users can control auto-open via `auto_open_nearby` boolean in `user_profiles` (see `schema_phase10.sql` migration).
- 🟢 **`haversineKm()` Utility** (`utils.ts`): Reusable Haversine distance function shared by camera auto-select and driving mode.

### Fixed 🐛
- 🔴 **Gemini 503 Retry**: ManualPriceModal now auto-retries up to 2× with a 2-second delay on Gemini 503 ("high demand") errors. The captured photo thumbnail stays visible throughout so users can compare AI results against the original image or enter prices manually.
- 🟡 **Gemini 429 Quota Pass-Through** (`api/parse-prices.ts`): HTTP 429 ("quota exceeded") errors are now passed through to the frontend instead of being swallowed as generic 500s. The UI shows a clear Estonian message: "Gemini päevane limiit (20 päringut) on täis."
- 🟡 **Inline Error Banners**: Replaced `alert()` and `window.confirm()` with inline dismissible banners for scan errors and brand-mismatch warnings. Photo is preserved on error.

### Key Decisions
- Driving mode radius is for the nearby panel only — not a map filter
- Auto-open on app start defaults to enabled for all users (toggle for logged-in users)
- Progressive pill reveal: 5 cheapest, not all — keeps map clean at low zoom
- 429 errors skip auto-retry (quota exhaustion makes retries pointless)

### Open Items
- `schema_phase10.sql` must be run in Supabase SQL editor to enable `auto_open_nearby` toggle
- Free-tier Gemini quota is 20 requests/day — consider upgrading or adding a paid key for real usage
- `CameraModal.tsx` is a dead stub — can be deleted

### Database Migrations
- `schema_phase10.sql`: Adds `auto_open_nearby boolean DEFAULT true` column to `user_profiles`.

### File Impact
- **New**: `src/components/CheapestNearbyPanel.tsx`, `schema_phase10.sql`, `Notes/Feedback.md`
- **Modified**: `api/parse-prices.ts`, `src/App.tsx`, `src/components/ManualPriceModal.tsx`, `src/components/Map.tsx`, `src/utils.ts`

---

## [v1.3.0] - Price History & UX Polish - 2026-04-07

### Added 🚀
- 🔴 **Price History Chart** (`StationDrawer.tsx`): Added a highly interactive time-series line chart (via `recharts`) that drops down inside the station drawer to visualize historical price shifts. Filters by fuel type and features responsive tooltips.
- 🟡 **Smart Map Panning** (`Map.tsx`): Overhauled map interaction calculations leveraging pixel-based `map.project`/`map.unproject` offsets. Stations always pan into the safety zone (top-third of screen) to prevent occlusion by the active bottom drawer.
- 🟡 **Favorite Station Upgrades** (`ProfileDrawer.tsx`): The favorites panel now includes time-of-last-update timestamps and a robust sorting mechanism (A-Z, Cheapest, Most Expensive, Freshness).
- 🟢 **Map Marker Selection Indicator**: Any selected station dot or price pill instantly receives a pronounced, bright white glowing halo to visually communicate its active state.

### Fixed 🐛
- 🔴 **Supabase Upsert Conflict**: Solved an edge-case `upsert` bug where the partial unique indexing (`WHERE user_id IS NOT NULL`) collided with Supabase's standard upsert definitions. Refactored anonymous/logged-in voting logic to use explicit `select` -> `update/insert` paths instead.
- 🟡 **Leaflet Parabolic SVG Scaling**: Patched an aggressive Leaflet zoom bug where large `flyTo` jumps exponentially distorted custom SVG icons (`recenter` and heavy zooms). Changed to `setView({animate: false})` dynamically when traversing multiple zoom levels.
- 🟢 **Dead Label Formatting**: Re-centered bounding boxes and removed unneeded static CSS margins inside Waze-style price pills.

### File Impact
- **Modified**: `src/components/Map.tsx`, `src/components/StationDrawer.tsx`, `src/components/ProfileDrawer.tsx`, `package.json`

---

## [v1.2.0] - User Dashboard & GDPR Compliance - 2026-04-07

### Added 🚀
- 🔴 **User Profile Dashboard** (`ProfileDrawer.tsx`): Logged-in users now see a profile icon in the header that opens a full-screen panel with contribution stats, favorite stations with live prices, and a default fuel type selector.
- 🟡 **Favorite Stations**: Star button on every station drawer lets users bookmark stations. Favorited stations appear in the profile with their latest price for instant commute checks.
- 🟡 **Default Fuel Preference** (`user_profiles` table): Users can save their car's fuel type. The map filter auto-applies it on every app launch.
- 🟡 **Contribution Score**: Profile tracks total prices submitted and votes cast as a gamification incentive.
- 🟡 **GDPR Cookie Banner** (`GdprBanner.tsx`): First-visit consent banner with "Nõustun" (Accept) and link to Privacy Policy. Uses `localStorage` to remember dismissal.
- 🟡 **Privacy Policy Modal** (`PrivacyModal.tsx`): Full Estonian-language privacy policy covering data collection, GPS handling, cookies, and GDPR user rights.

### Fixed 🐛
- 🔴 **Gemini Model 404**: Updated AI model from retired `gemini-1.5-flash` to `gemini-2.5-flash` in `api/parse-prices.ts`.
- 🟡 **GPS Recenter Lock**: Eliminated `map.locate({ setView: true })` from the recenter button fallback, which was hijacking pan control and forcing the camera to snap back to the user indefinitely.
- 🟡 **OAuth Redirect to localhost**: Added explicit `redirectTo: window.location.origin` in `AuthModal.tsx` to prevent Supabase from sending users to `localhost:3000` after Google login.

### Security 🔐
- 🔴 **Leaked API Key Remediation**: Removed `.env` from Git tracking history, regenerated Gemini API key, and hardened `.gitignore` with `.env` and `.env.*` rules.

### Removed 🗑️
- 🟢 **Facebook Login Button**: Removed pending Meta developer verification to avoid showing a broken button.

### Database Migrations
- `schema_phase8.sql`: Added `user_profiles` (fuel preferences) and `user_favorites` (bookmarked stations) tables with full RLS policies.

### File Impact
- **New**: `src/components/ProfileDrawer.tsx`, `src/components/GdprBanner.tsx`, `src/components/PrivacyModal.tsx`, `schema_phase8.sql`
- **Modified**: `src/App.tsx`, `src/components/StationDrawer.tsx`, `src/components/ManualPriceModal.tsx`, `src/components/AuthModal.tsx`, `src/components/Map.tsx`, `api/parse-prices.ts`, `src/index.css`, `.gitignore`

---

## [v1.1.0] - AI Vision & Map Stabilizations - 2026-04-07

### Added 🚀
- **Camera AI Scanning**: Implemented a Vercel Serverless Endpoint (`api/parse-prices.ts`) leveraging Google's **Gemini 2.5 Flash** Vision model. Users can seamlessly utilize their mobile device's back-camera to photograph gas station screens and instantly auto-fill the pricing form.
- **AI Brand Cross-Validation**: Prompt-engineered the Gemini AI to extract corporate branding from images on-the-fly. If the AI detects a competitor logo (e.g. scanning an Olerex totem while parked on a Circle K node), it generates an aggressive Javascript override warning the user.
- **Formatted Names**: Abstracted the `getStationDisplayName(station)` utility into `src/utils.ts` to strictly standardize station labels (e.g. "Circle K (Kohila)") inside the Navigation search bounds, the Active Slide Drawer, and the Update Prices Modal.

### Fixed 🐛
- **Map Focus Constraints**: Refactored the Map component coordinate flyTo system. Reduced the mathematical latitude bump to `0.008`, floating the marker correctly in the upper center bound of mobile displays and eliminating UI overlapping from the bottom slider drawer.
- **Infinite GPS Loop**: Decoupled `map.locate()` behavior. Switched the `RecenterButton` to use passive native background GPS watching (which eliminates the 10-second OS hardware stall), whilst terminating the aggressive Leaflet continuous tracking bug that locked camera panning.
- **Auth Redirect Issues**: Injected a proactive `redirectTo: window.location.origin` inside `AuthModal.tsx` so proper Vercel production authentication domains accurately persist against Supabase URL requirements.

### Security 🔐
- **Environment Isolation**: Force-removed `.env` from Git caching histories and fortified `.gitignore` rules to permanently block Supabase Secret and Gemini AI token leakage events in remote repositories.

### Removed 🗑️
- **Facebook Oauth Deployment**: Removed Facebook Login dependencies and handlers entirely to minimize UI clutter and enforce unified standard login flow.
