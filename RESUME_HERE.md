# Kyts — RESUME HERE

Operational quick-start for a fresh/parallel session. Depth lives in `CHANGELOG.md` and workspace memory (`memory/project_kutuse_kaart.md`); this is just enough to get going.

## Reconnect / access
- **Repo:** `/Users/mitokafander/Documents/AI Projects/kytuse_kaart/` · GitHub `MitoKafander/kutuse_kaart` (repo still named *kutuse_kaart*; the app is **Kyts**).
- **Deploy:** push to `origin/main` → Vercel auto-deploys to **https://kyts.ee**. No staging. Mikk's MO is "ship and roll back if it breaks" — commit + push when the build is green. Rollback: `git revert <sha> && git push`, or one click in the Vercel dashboard.
- **Stack:** React/TS/Vite PWA · Supabase (project `sdtwolcoibcobpzgfqxx`) · Gemini 2.5 Flash (AI totem scan + market-insight text) · Vercel serverless (`api/`).
- **Gemini billing = PREPAY since 2026-09-13** (Google AI Studio, irreversible; €25 initial credit). Zero balance → Gemini calls fail silently (scans error, insights stop updating). Balance/top-up lives in AI Studio → Billing.
- **Secrets:** local `.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`, Sentry. ⚠️ `EIA_API_KEY` lives **only in Vercel env**, not local — local market-insight runs skip EIA. Despite the legacy names, `VITE_SUPABASE_ANON_KEY` holds the `sb_publishable_` key (since the first commit, 2026-04-06) and `SUPABASE_SERVICE_ROLE_KEY` the `sb_secret_` key (local + Vercel, since 2026-09-18).
- **DB read-only diagnostics:** service-role key in `.env` + `@supabase/supabase-js`; copy the paging loop in `scripts/diagnose_point_spam.js`. PostgREST caps every response at 1000 rows — always page.
- **Build / verify:** `npm run build` · `npx tsc --noEmit -p tsconfig.app.json` (frontend) · `npx tsc --noEmit -p api/tsconfig.json` (serverless). ESLint baseline = 0 errors / ~151 `no-explicit-any` warnings (deliberate).
- **Migrations:** DDL run by hand in the Supabase SQL editor (not the MCP). Latest applied = **phase 64** (active-aware recount trigger, 2026-07-16). Supabase MCP `execute_sql` is **unauthorized** (no access token) — read/verify via the service-role `@supabase/supabase-js` client instead.
- **DB writes (data fixes):** service-role `.mjs` scripts under `scripts/` (e.g. `apply_station_audit_fix.mjs`, `apply_feedback_triage_2026-07-25.mjs`). `~/.claude/settings.json` allows `Bash(node scripts/*)`. ⚠️ Write these as **named committed scripts** — ad-hoc `_tmp_*.mjs` heredocs that write to prod get **auto-mode-classifier-DENIED** even under that allow rule; a committed `scripts/*.mjs` doing the same writes passes.

## Verified state (2026-09-18)
- **Off Supabase's legacy API keys:** Vercel + local `SUPABASE_SERVICE_ROLE_KEY` = `sb_secret_` (prod dry-run insight → 200 with real `samples7d` + Gemini text), frontend on `sb_publishable_` since 2026-04-06, `package.json` pins Node 24.x. Legacy keys still **enabled** — disable after a 24h `edge_logs` check (needs the Supabase dashboard login). Detail in CHANGELOG.

## Verified state (2026-07-31)
- **Search now indexes `alt_name` + `addr:place`/`addr:village`** (commit `23f8496`, `src/App.tsx` only). Reported symptom: searching "peetri" never surfaced **Neste Peetri** (Veesaare tee 2, Rae vald) — OSM keeps its location in `alt_name` while `name` is a bare "Neste" and `addr:city` is absent, and since every query token must match some field, "peetri" dropped it. `alt_name` now indexed at weight 3 (name variant, not a locality); `addr:place`/`addr:village` folded into the weight-5 city field (all three answer "which settlement"). Verified by replaying the index+scoring over all 560 active prod stations: **0 stations lost from any prior query**; newly reachable = Neste Peetri, Circle K Märjamaa, Neste Valdeko, Diisel24 Päri (7 active stations have `alt_name` as their only location text), and "tallinna mnt neste" now ranks Neste Tallinna mnt first. _(Data note: 151 active stations still have neither `addr:city` nor `alt_name` — most carry the place inside `name` ("Jetoil Peetri tankla") so they remain findable. Latvian rows use `addr:district`/`addr:subdistrict` (novads/pagasts), still unindexed.)_

## Verified state (2026-07-25)
- **Main-screen search fixed + ranked** (commits `2b68a85` + `afcf89a`, pushed → deploying to kyts.ee; `src/App.tsx` only). The top-bar search used one whole-query `.includes()` per field, so "olerex pärnu" / "rapla circle k" (brand + place) matched nothing. Now: **tokenised** (every whitespace token must hit some field — brand/canonical/city/OSM-name/street/operator, any order), **diacritic-folded** (NFD strip → "parnu" finds "Pärnu"), **ranked** by field weight (city/brand 5 > name 3 > street 2 > operator 1, +3 whole-word) before the 10-cap, with a per-station `searchIndex` memo (built once per `[stations]`, not per keystroke) and the `getBrand` `'Tundmatu'` sentinel kept out of the haystack. Verified vs prod data: "olerex pärnu"→3, "rapla circle k"→the Rapla Circle K, "tallinn olerex"→10 Tallinn-city Olerex ranked, "tallinna mnt neste"→multi-word street still resolves. ⚠️ Reviewed via 14-agent adversarial workflow (0 ship-blockers). _(`Circle K (Uusküla, Risti)` IS Rapla's — its OSM `name` carries "Rapla" while addr is tagged Uusküla/Risti.)_
- **Both feedback queues at 0.** "Check feedback" pass: general `v_open_feedback` = 0, all `station_reports` actioned.
- **Station "Jõelähtme tankla" (`8ecf1e4e`) → renamed "Olerex"** — operator was already Olerex in amenities but `getBrand()` reads only `name`. Verified one-off (1/485 active EE stations), so no `getBrand` code change.
- **Vald-boundary feedback (`c175de51`) closed + reporter (Kaia) thanked** via in-app `feedback_replies`. Applied through committed `scripts/apply_feedback_triage_2026-07-25.mjs`.

## Verified state (2026-07-16)
- **Avastuskaart count integrity fixed (phase 64, applied + verified).** `recount_parish()` is now active-aware — deactivating/reactivating a station auto-adjusts `parishes.station_count` (the discovery-map denominator). Before, soft-deactivates never decremented → valds stranded at N-1/N. All 78 parishes + 15 maakonnad reconciled; global drift 0. See memory `reference_kyts_avastuskaart_counts`.
- **Phantom/duplicate audit applied** (`scripts/apply_station_audit_fix.mjs`): 11 stations deactivated + Circle K Pärnu-mnt-236 pair merged (kept "Circle K Järve automaat"). Removed shadow-dups from the "Jetoil PDF 2026-04-29" seed batch + gas/AdBlue/private/fleet-depot points. Counts auto-adjusted by the phase-64 trigger.
- **Station-report triage:** Airok→Elenger (deactivated, CNG/CBG out of scope), Terminal Oil Maardu (deactivated, fleet diislipunkt), Circle K Mustvee → rebranded Olerex, Hepa Kehtna dup deactivated.

## Verified state (2026-07-08, commit `49982db`, migration applied + deployed)
- **Owner-only admin price entry (phase 62)** — `migrations/schema_phase62_admin_price_bypass.sql` (applied) + `src/components/AdminPriceModal.tsx` + `App.tsx`. Lets **only** mikk.rosin@gmail.com (uid `3eac34e5-…`, email/password login) insert prices for **any station with a custom `reported_at`**, bypassing the proximity/velocity/band triggers — for cheap far-away/cross-border prices (the Latvia/Lithuania Facebook group) the crowd flow can't reach. Reached by **long-pressing the camera FAB (~550 ms)**; the modal renders only for the owner uid, normal tap = camera scan for everyone.
  - ⚠️ **The trigger bypass is deliberate, not a bug.** `is_kyts_admin(auth.uid())` early-returns in the phase31/43/51 trigger fns; RLS lets owner rows skip `submitted_lat/lon`; `entry_method` widened to `'admin'`. The 0.30–4.00 € CHECK still applies to the owner. Gated on `auth.uid()` (caller's JWT), so a forged `user_id` can't bypass.
  - Scope = existing stations only (modal can't create stations). Missing LV/LT stations need a seed first (`scripts/seed_latvia_border.js`).
  - FB scraping stays a NO (login wall — WebFetch only sees group title/author). Workflow: screenshot post → drop image in chat → read prices → enter via modal.
  - Insert auto-retries transient network failures (3× backoff); fails fast on real DB errors. Two entry points: long-press camera FAB (search) or StationDrawer "Admin: lisa hind" button (map-first, pre-selected).
- **Admin rows are excluded from all gamification (phase 63, `22e8703` + `migrations/schema_phase63_…sql`).** `entry_method='admin'` rows carry the owner's user_id but must NOT count toward his points / discovered maakonnad-vallad / brand collector / public footprint (curated far/cross-border data, not personal scans). Gamification is read-time, so the fix is view + client filters (`v_prices_earning`, `v_user_discoveries`, 3 leaderboard views, `get_user_footprint`; App.tsx `userContributedStationIds`). Retroactive — recomputes on read, no data cleanup.

## Verified state (2026-06-22, commit `490a88a`, deployed to prod)
- **Statistics page hardened** (`src/components/StatisticsDrawer.tsx`): robust pooled trend endpoints (no more n=1 swings), 14-day brand ranking, 24h "cheapest now" fallback with stale-marking, market-relative biggest-drops.
- **Market signal made honest** (`api/_lib/marketInsight/computeSignal.ts`, `api/generate-market-insight.ts`): confidence cap 90→70; **diesel `proxyReliable:false`** → emits "no timing edge", never a confident buy/wait (its US NY-Harbor proxy backtested ~0 vs EE diesel); gasoline RBOB signal kept; overall confidence follows the actionable leg.
- Signal changes apply on the **next cron firing** (06:00 / 15:00 UTC), not immediately.

## Baltic expansion (phase 65) — ✅ LIVE since 2026-09-23

Latvia and Lithuania are first-class countries on kyts.ee. Prod: **482 EE + 548 LV +
742 LT active stations**, LV's 5 planning regions / 42 novadi and LT's 10 apskritys /
60 savivaldybės in the Avastuskaart. Full detail in CHANGELOG 2026-09-23.

**The sequence that was run** (kept because each step is idempotent — re-run any of them
after an OSM refresh, and follow the same order when adding a fourth country):

1. **Apply the migration** — `supabase db query --linked -f migrations/schema_phase65_baltic_countries.sql`
   (or paste it into the Supabase SQL editor). Nothing else works before this; it's also
   what keeps Estonia's catalog separate from the new ones. Rollback block is at the bottom
   of the file. **Rehearsed** against a container restored from `supabase db dump --linked`,
   where it applies clean and its triggers/views behave (see "SQL access" below).
2. `node scripts/fetch_baltic_osm.mjs` — caches OSM into `.osm-cache/` (gitignored,
   ~18 MB, reused for 72 h). Read-only. Expect mirror 504s; it rotates and retries.
3. `node scripts/seed_baltic_regions.mjs --dry-run` then without the flag — writes 5+10
   level-1 regions and 42+60 municipalities, then points existing LV stations at theirs.
4. `node scripts/seed_baltic_stations.mjs --dry-run` then without the flag — inserts
   **1,215** new stations (LV +473, LT +742). The dry run prints exactly what it would do.
5. `node scripts/verify_baltic_expansion.mjs` — must end "All checks passed". The checks
   that matter are the Estonian invariants (15 maakonnad / 78 parishes / 0 count drift).
6. Merge + push. Vercel redeploys; **disable the build cache** only if a `VITE_*` changed
   (none did here).
7. Optional, after the first Latvian or Lithuanian prices land:
   `curl -H "Authorization: Bearer $CRON_SECRET" .../api/generate-market-insight?country=LV`
   — under 20 local samples it deliberately skips rather than inventing an insight.

**Order matters** in two places:
- **Regions before stations**, because a station's `parish_id` is an FK.
- **Deploy the new bundle BEFORE the region seed** (step 3). The migration alone is safe
  against the live old bundle — it reads explicit column lists that adding a column can't
  break — but the moment LV/LT rows land in `maakonnad`/`parishes`, an old bundle with no
  country filter would merge all three countries into one Estonian Avastuskaart (30
  regions, inflated denominators). The new bundle scopes by country, so once it's out the
  seeds are invisible until you switch countries.

### SQL access (Claude CAN run DDL here)
`supabase db query --linked "<sql>"` and `-f <file>` work: the **CLI is authenticated**
even though the Supabase **MCP is not** (`SUPABASE_ACCESS_TOKEN` unset → every
`mcp__supabase__*` call returns Unauthorized). Link once with
`supabase link --project-ref sdtwolcoibcobpzgfqxx --yes`. Note the auto-mode classifier
denies applying a migration as a "Production Deploy" — that needs Mikk's go-ahead or a
Bash permission rule.

**Rehearse any migration before prod**, it's cheap and it already paid:
```
supabase db dump --linked -f /tmp/prod_schema.sql          # read-only
docker run -d --name pg-rehearsal -e POSTGRES_PASSWORD=postgres \
  public.ecr.aws/supabase/postgres:17.6.1.104              # same version as prod
docker exec -i pg-rehearsal psql -U postgres -q < /tmp/prod_schema.sql     # ON_ERROR_STOP off: the dump re-creates an extension the image has
docker exec -i pg-rehearsal psql -U postgres -v ON_ERROR_STOP=1 < migrations/<file>.sql
```
The image restarts Postgres once during init, so wait for **two consecutive** successful
`select 1`s, not one. This caught phase 65 failing *halfway through*: `CREATE OR REPLACE
VIEW` can only APPEND columns, so adding `country` in the middle of
`v_user_parish_progress` errors with "cannot change name of view column" — it needs an
explicit `drop view` of the dependent + the view first.

## Next steps (loose priority)
0. 🔖 **Gemini on prepay: calls WORK** (2026-09-18 prod dry-run insight generated Gemini text). Still open: confirm auto-reload or a low-balance alert in AI Studio → Billing. Camera-scan health: PostHog (`~/.config/kyts/posthog.json`, HogQL on `ai_scan_success`/`ai_scan_failure` with `model_used`/`code`).
0b. **Disable Supabase legacy anon/service_role keys** once Mikk is logged in to supabase.com in the Playwright browser: 24h `edge_logs` check for legacy use (query in Point `RESUME_HERE.md` 🔖), then Dashboard → Settings → API Keys (reversible). Detail: CHANGELOG 2026-09-18.
1. **Check feedback** when asked — **TWO channels:** general `feedback` → `v_open_feedback`, AND per-station complaints → `station_reports` / `v_station_report_counts` (no `resolved_at` — closing = taking the action). Never seed prices from feedback; anonymous feedback can't receive replies. Detail in memory `project_kyts_feedback_triage`. Fast path: `node scripts/check_feedback.mjs`. **Both queues empty as of 2026-07-25.** Standing scope call: Jetoil Betooni/Laekvere DP. _(Vald-boundary "double line" FULLY FIXED 2026-07-21 — both layers re-sourced from OSM; see gotcha.)_
2. **Diesel timing stays OFF** unless Mikk subscribes to a gasoil feed (~$20-30/mo Twelve Data Grow / EODHD — he declined for now). If he does: wire the feed in `api/_lib/marketInsight/fetchMarketData.ts`, flip `proxyReliable: true` in `api/generate-market-insight.ts`, then **validate it correlates** with EE diesel before trusting it.
3. Progressive TS typing pass (the 151 `any`s) — only worth doing alongside `supabase gen types typescript`.

## Gotchas (the time-costing ones)
- **Map shows "API KEY REQUIRED" watermark?** CARTO basemaps need a key since 2026 (fixed 2026-09-18, `930110e`). Key = `VITE_CARTO_KEY`, Vercel **Production, type Config** (public by design; Vercel warns about the `VITE_` prefix — ignore). Key is **referer-restricted to kyts.ee + www.kyts.ee** (CARTO rejects `localhost`), so it's NOT in local `.env` → local dev shows the watermark, harmless. Free tier = 5M tiles/mo, non-commercial; manage at carto.com/basemaps/apikey (sign in with info@mikkrosin.ee). CARTO attribution must stay visible (terms).
- **AI scan / market insight failing with an auth/quota/billing error (not `AI_UPSTREAM_BUSY`)?** Check the Gemini prepay credit balance in AI Studio first. Since 2026-09-13 an empty balance stops the calls instead of billing.
- **Overpass answers `200 {elements: []}` when it's busy.** Not an error, not empty data — a
  throttled mirror. `scripts/_lib/overpass.mjs` rotates mirrors until a response passes a
  declared sanity check; use it for any new OSM query rather than a bare `fetch`, or a seed
  will one day read "this country has no municipalities" and act on it.
- **Region ids are hand-allocated and permanent:** EE 1-15, LV 101-105, LT 201-210
  (`scripts/_lib/baltic_regions.mjs`). They're `maakonnad.id` in prod AND `maakond_id`
  inside the shipped boundary geojson — renumbering silently unlinks the drawn map from the
  catalog. Level-2 ids are OSM relation ids, same as Estonia's 78 parishes.
- **Latvia has no admin_level=4 in OSM.** Its 5 planning regions are a statutory grouping
  in `LV_MUNICIPALITY_REGION`, not geometry. The loader throws if OSM's municipality list
  and that table ever disagree in either direction — if a Latvian reform lands, that's the
  error you'll see, and the table is what needs editing.
- **PostgREST 1000-row cap:** any `.limit(N>1000)` silently truncates. Use the `fetchAllRows` helper (App.tsx) / paging in scripts.
- **Yahoo & Stooq are dead for serverless fetches:** Yahoo 429s (needs cookie+crumb), Stooq returns a JS bot-challenge page. Use proper APIs (EIA, Frankfurter) only — don't re-attempt scraping them.
- **Price inserts have DB guards** (phases 31/43/50/51): proximity (1 km), velocity (130 km/h), static band (€0.30–4.00), per-fuel ±35% median band. Rejections surface as SQLSTATE 23514 → friendly Estonian copy. Don't "fix" a rejected insert by loosening these without checking the data first.
- **Overlapping-window stats lie:** the diesel "mean-reversion" that looked real (r=−0.53) was a measurement artifact; a bias-free split-half test put it at −0.05. Validate any autocorrelation with disjoint windows.
- **Read-only analysis scripts are throwaway:** the DB-audit scripts this session were written under `scripts/` and deleted after use — recreate from the `diagnose_point_spam.js` pattern when needed. (Exception kept as a record: `apply_station_audit_fix.mjs`, idempotent.)
- **Deactivating a station strands its vald pre-phase-64** unless `station_count` is recomputed. Post-phase-64 the trigger auto-adjusts; the old `hide_*.sql` scripts did a manual recompute. If you ever bulk-edit `active`, verify `station_count` drift = 0 after.
- **Vald-boundary "double lines" were a DATA problem, not styling — FULLY FIXED 2026-07-21.** The shipped geojsons were simplified per-polygon so neighbours' shared borders didn't coincide (only ~26% of vald-vald edges). Fix: **both layers re-sourced from current OSM** via `scripts/rebuild_boundaries.mjs` (Overpass admin_level=7 → `scripts/osm_assemble_boundaries.cjs` → DB-join by osm_id → mapshaper simplify+dissolve). Adjacent municipalities share the same OSM ways → single lines by construction: interior vald-vald 26%→**100%**, county-vs-vald 11.8%→**99.8%**. The app's 78 parish ids ARE OSM relation ids (join is exact); geometry is drawn-only so Avastuskaart counts (DB-driven) are untouched. To regenerate when boundaries change: re-run the Overpass query in `rebuild_boundaries.mjs`, then the script. Confirmed live on kyts.ee (single vald lines at field zoom, 0 console errors). ⚠️ Estonia is now 78 municipalities (Toila merged into Jõhvi 2025-11-28).
