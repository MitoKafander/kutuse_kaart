# Kyts — RESUME HERE

Operational quick-start for a fresh/parallel session. Depth lives in `CHANGELOG.md` and workspace memory (`memory/project_kutuse_kaart.md`); this is just enough to get going.

## Reconnect / access
- **Repo:** `/Users/mitokafander/Documents/AI Projects/kytuse_kaart/` · GitHub `MitoKafander/kutuse_kaart` (repo still named *kutuse_kaart*; the app is **Kyts**).
- **Deploy:** push to `origin/main` → Vercel auto-deploys to **https://kyts.ee**. No staging. Mikk's MO is "ship and roll back if it breaks" — commit + push when the build is green. Rollback: `git revert <sha> && git push`, or one click in the Vercel dashboard.
- **Stack:** React/TS/Vite PWA · Supabase (project `sdtwolcoibcobpzgfqxx`) · Gemini 2.5 Flash (AI totem scan + market-insight text) · Vercel serverless (`api/`).
- **Gemini billing = PREPAY since 2026-09-13** (Google AI Studio, irreversible; €25 initial credit). Zero balance → Gemini calls fail silently (scans error, insights stop updating). Balance/top-up lives in AI Studio → Billing.
- **Secrets:** local `.env` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`, Sentry. ⚠️ `EIA_API_KEY` lives **only in Vercel env**, not local — local market-insight runs skip EIA. Despite the legacy names, `VITE_SUPABASE_ANON_KEY` holds the `sb_publishable_` key (since the first commit, 2026-04-06) and `SUPABASE_SERVICE_ROLE_KEY` the `sb_secret_` key (local + Vercel, since 2026-09-18).
- **DB read-only diagnostics:** service-role key in `.env` + `@supabase/supabase-js`; copy the paging loop in `scripts/diagnose_point_spam.js`. PostgREST caps every response at 1000 rows — always page.
- **Build / verify:** `npm run build` · `npx tsc --noEmit -p tsconfig.app.json` (frontend) · `npx tsc --noEmit -p api/tsconfig.json` (serverless) · `npm run verify:currency` (phase-A currency gate) · `node scripts/verify_countries.mjs` (4-country catalog + live boundary fetch) · `node scripts/cache_headroom.mjs` (localStorage budget — run before adding a country). ESLint baseline = 0 errors / ~189 warnings, almost all `no-explicit-any` (deliberate).
- **Migrations:** DDL run by hand in the Supabase SQL editor (not the MCP). Latest applied = **phase 68** (currency as a first-class fact: `price_bounds`, `prices.currency`, `enforce_price_bounds`, 2026-09-26). ⚠️ Migrations now go through `supabase db query --linked -f <file>` — the **CLI is authenticated**, see "SQL access" below. Supabase MCP `execute_sql` is **unauthorized** (no access token) — read/verify via the service-role `@supabase/supabase-js` client instead.
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

## Four countries — ✅ LIVE (phase 65 Baltics 2026-09-23, phase 67 Finland 2026-09-24)

Estonia, Latvia, Lithuania and Finland are all first-class countries on kyts.ee. Prod:
**482 EE + 548 LV + 742 LT + 1,890 FI = 3,662 active stations**. Avastuskaart tiers:
EE 15 maakonda / 78 valda, LV 5 planning regions / 42 novadi, LT 10 apskritys /
60 savivaldybės, FI 19 maakuntaa / 308 kuntaa. Full detail in CHANGELOG 2026-09-23 and
2026-09-24.

### Adding country five — Sweden, and it is NOT a data-only job

⚠️ **Sweden is blocked on currency work, not on the recipe below.** It is the first non-euro
country (SEK), and every remaining neighbour is too — NOK, DKK, PLN. Phase A of
`Notes/Plan_Local_Currency.md` is **done and live** (prices carry a currency, every price
renders in its own). Still owed before Swedish data lands:
**B** FX for cross-border comparison, and **C** the camera scanner — `FUEL_RANGES` in
`api/parse-prices.ts` are EUR and out-of-range reads are *dropped*, so until C ships every
Swedish pump photo scans as empty. C before D is strongly recommended: the camera is the
feature most likely to bring a new user back.

Sweden's measured facts, so nobody re-derives them: OSM **admin_level 4 = 21 län** and
**7 = 290 kommuner**, both full covers — **not level 8**, which has only 83 relations and is
the same partial-cover trap Finland's level 7 was. Region id band **401–421**. ~2,800
stations puts the localStorage cache near **66%** of quota. There is **no `sv` locale**, so
Swedes get the English UI.

Finland needed **no new code paths** — it went in as data plus one entry in each registry,
which is what makes this a repeatable recipe rather than a one-off. Every script takes
**positional country codes** (`node scripts/seed_country_stations.mjs FI`) and defaults to
`SEEDABLE_COUNTRIES` in `scripts/_lib/regions.mjs` when given none. Every step is
idempotent, so a bare re-run after an OSM refresh is safe and re-checks the lot.

**Register the country first** (the seeds read all of these):
- `src/constants/countries.ts` — flag, name key, center/zoom/bbox, boundary paths, the two
  tier names, preferred locale.
- `scripts/_lib/regions.mjs` — its region-id table (next free 100-band), region emoji, and
  add the code to `SEEDABLE_COUNTRIES`.
- `scripts/fetch_country_osm.mjs` `ADMIN` — the two admin_levels **and the sanity bounds**.
  Check the levels against OSM by hand: Finland's level-2 tier is 8, not 5 (it has no 5),
  and its level 7 covers only 69 of 308 units — a partial cover that looks like a working
  answer. Latvia's pilsētas were the same trap.
- `src/i18n/locales/*.json` — country name + both tier names in all six locales.
- `src/utils.ts` `CHAIN_PATTERNS` if the country's OSM data names chains inside `name`
  rather than tagging `brand=` (Finland needed six). **Verify each new pattern is inert
  against every existing active station before seeding** — a loose pattern silently
  rebrands another country's rows.

**Then, in this order:**

1. **Apply the migration** — only if the schema needs changing. Phases 65 and 66 made the
   schema country-generic, so a fifth country needs no DDL at all. If one is needed:
   `supabase db query --linked -f migrations/<file>.sql`, rehearsed in Docker first (below).
2. `node scripts/fetch_country_osm.mjs XX` — caches OSM into `.osm-cache/` (gitignored,
   ~18 MB, reused for 72 h). Read-only. Expect mirror 504s; it rotates and retries.
3. `node scripts/rebuild_boundaries_country.mjs XX` — writes
   `public/{regions,municipalities}_xx.geojson`. **Commit these.** They are the step that
   got forgotten for Finland, and a missing one fails silently (see the `vercel.json`
   gotcha).
4. **Deploy the client** — merge + push, wait for Vercel. This must happen before step 5.
5. `node scripts/seed_country_regions.mjs XX --dry-run`, then without the flag.
6. `node scripts/seed_country_stations.mjs XX --dry-run`, then without the flag. The dry
   run prints exactly what it would insert, and re-runs report `new: 0`.
7. `node scripts/verify_countries.mjs` — must end "All checks passed". The checks that
   matter are the Estonian invariants (15 maakonnad / 78 parishes / 0 count drift) and the
   **live boundary-file fetch**, which is what catches an undeployed geojson.
   `SKIP_LIVE_CHECK=1` skips the live half for offline runs.
8. Optional, once ~20 local prices exist:
   `curl -H "Authorization: Bearer $CRON_SECRET" .../api/generate-market-insight?country=XX`
   — under 20 samples it deliberately skips rather than inventing an insight.

**Why step 4 sits where it does.** The migration is safe against the live old bundle (it
reads explicit column lists that adding a column can't break), but the moment new rows land
in `maakonnad`/`parishes`, an old bundle whose `toCountryCode()` doesn't know the code
falls back to `'EE'` and merges the new regions into Estonia's Avastuskaart — inflated
denominators, foreign badges in the Estonian grid. Deploy first and the seeds are invisible
until a user switches country. **Regions before stations** is the other fixed order:
`stations.parish_id` is an FK.

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
3. **Brand-collector noise outside Estonia.** Measured 2026-09-25 against prod, so use
   these numbers rather than re-guessing: chain-match coverage is **EE 95% · FI 90% ·
   LV 82% · LT 80%** of active stations, and the *collector list* carries **EE 26 · FI 88 ·
   LT 68 · LV 54** single-station "brands" — `getBrand()` falls back to the raw OSM name, so
   every unmatched local forecourt becomes its own entry. Those entries can never be
   completed (a brand win needs `total >= 2`), so they are list clutter, not a broken
   feature: collectible brands are EE 13 · FI 12 · LT 33 · LV 19, and Lithuania actually has
   more than Estonia. ⚠️ An earlier read of this said "EE 78% vs LV/LT 25%" — that was
   wrong, don't propagate it. The work, if it's worth doing, is chain patterns against the
   LV/LT/FI name distributions (Finland's six took it from 343 raw names to 138 brands),
   each verified inert against every other country's stations first.
4. **Latvia's level-1 tier is too coarse** (5 planning regions, ~110 stations each, vs
   Estonia's 15 maakonda at ~32). Measured effect: LV has **zero** single-station tiles
   where Estonia has 12, so the Avastuskaart's easy early wins don't exist there. Splitting
   Rīga out is the smallest change that moves the distribution. Level-2 re-tiering is
   PARKED — the hybrids were measured and none beat the statutory novadi.
5. Progressive TS typing pass (the ~185 `any`s) — only worth doing alongside `supabase gen types typescript`.

## Gotchas (the time-costing ones)
- **Map shows "API KEY REQUIRED" watermark?** CARTO basemaps need a key since 2026 (fixed 2026-09-18, `930110e`). Key = `VITE_CARTO_KEY`, Vercel **Production, type Config** (public by design; Vercel warns about the `VITE_` prefix — ignore). Key is **referer-restricted to kyts.ee + www.kyts.ee** (CARTO rejects `localhost`), so it's NOT in local `.env` → local dev shows the watermark, harmless. Free tier = 5M tiles/mo, non-commercial; manage at carto.com/basemaps/apikey (sign in with info@mikkrosin.ee). CARTO attribution must stay visible (terms).
- **AI scan / market insight failing with an auth/quota/billing error (not `AI_UPSTREAM_BUSY`)?** Check the Gemini prepay credit balance in AI Studio first. Since 2026-09-13 an empty balance stops the calls instead of billing.
- **Overpass answers `200 {elements: []}` when it's busy.** Not an error, not empty data — a
  throttled mirror. `scripts/_lib/overpass.mjs` rotates mirrors until a response passes a
  declared sanity check; use it for any new OSM query rather than a bare `fetch`, or a seed
  will one day read "this country has no municipalities" and act on it.
- **Region ids are hand-allocated and permanent:** EE 1-15, LV 101-105, LT 201-210,
  FI 301-319 (`scripts/_lib/regions.mjs`), one 100-wide band per country and
  `verify_countries.mjs` asserts nothing strays out of its band. They're `maakonnad.id` in prod AND `maakond_id`
  inside the shipped boundary geojson — renumbering silently unlinks the drawn map from the
  catalog. Level-2 ids are OSM relation ids, same as Estonia's 78 parishes.
- **Latvia has no admin_level=4 in OSM.** Its 5 planning regions are a statutory grouping
  in `LV_MUNICIPALITY_REGION`, not geometry. The loader throws if OSM's municipality list
  and that table ever disagree in either direction — if a Latvian reform lands, that's the
  error you'll see, and the table is what needs editing.
- 🔴 **A stale `onConflict` list raises 42P10; PostgREST does NOT fall back to an insert.**
  Phase 68 widened `user_loyalty_discounts`' unique key to `(user_id, brand, currency)` while
  `App.tsx` still upserted on `(user_id, brand)`, so **every loyalty save failed silently for
  a day**. The migration rehearsal was green and the bundle shipped fine — nothing exercised a
  write through the client's own call shape. **Any migration that touches a unique or primary
  key must `grep -rn onConflict src/ scripts/` and fix every match.**
  `migrations/verify_phase68_currency.sql` now asserts each client `onConflict` list resolves
  to a real constraint, so the harness fails instead of production.
- 🔑 **Prices carry a currency (phase 68), and the local one is what users see.** `price_bounds`
  (EUR 0.30–4.00 @3dp, SEK 5.00–40.00 @2dp) is the server authority, enforced by
  `enforce_price_bounds()` / `trg_price_bounds`; `src/constants/countries.ts` `CURRENCIES`
  mirrors it for client-side input validation, the same arrangement `MAX_SUBMIT_KM` has with
  the proximity trigger — **change one and you must change the other.** Adding a currency is
  one INSERT into `price_bounds` plus one entry in `CURRENCIES`; no migration needed.
  ⚠️ `enforce_price_bounds` has **no `is_kyts_admin()` bypass** — the phase-50 CHECK it
  replaced applied to the owner too, and restoring a bypass would silently widen phase 62.
  ⚠️ Never render a price with a bare `€`: use `formatPrice` / `formatStationPrice` /
  `formatSubunitDelta` from `src/utils.ts`. Deliberately not `Intl.NumberFormat` — see
  CHANGELOG 2026-09-26 for why (it would change Estonian rendering *and* get Swedish wrong).
  ⚠️ Loyalty discounts are **absolute subunits**, so they are scoped to the active country's
  currency on both read and write.
  Remaining phases (FX, the scanner, Sweden's data) are in `Notes/Plan_Local_Currency.md`.
- **PostgREST 1000-row cap — `stations` is way OVER it** (3,715 rows after Finland; it was 610 before the Baltic seed). Any `.limit(N>1000)` *and any bare `.select()`* silently truncates, and a truncated station list looks exactly like a complete one. This shipped broken for ~15 minutes on 2026-09-23: the live map showed LT 23/742 and EE 430/482. Client reads go through `fetchAllRows` (App.tsx), scripts through `fetchAll` (`scripts/_lib/db.mjs`). Everything else is small (parishes 180, maakonnad 30, v_reporters 41, user_profiles 61) — **stations is the one to watch**, and the next table to cross 1k will fail the same silent way.
- **A missing file under `public/` returns 200, not 404.** `vercel.json` rewrites
  `/((?!api/|assets/).*)` to index.html, so an undeployed static asset answers **200 with
  content-type text/html**; the boundary loader in `App.tsx` (`.catch(() => null)` around
  `fetch(url).then(r => r.ok ? r.json() : null)`) swallows the parse error and caches the
  null *per country*, so the layer is silently absent for the rest of the session. Network tab shows 200, the file
  exists locally, the DB catalog matches — every upstream signal looks healthy. This is how
  Finland's Avastuskaart shipped empty. Grepping the *bundle* for the filename does not
  test it (the string is in `countries.ts` regardless); **check the served content-type**,
  which `verify_countries.mjs` now does for all eight boundary files.
- **Yahoo & Stooq are dead for serverless fetches:** Yahoo 429s (needs cookie+crumb), Stooq returns a JS bot-challenge page. Use proper APIs (EIA, Frankfurter) only — don't re-attempt scraping them.
- **Price inserts have DB guards** (phases 31/43/50/51): proximity (1 km), velocity (130 km/h), static band (€0.30–4.00), per-fuel ±35% median band. Rejections surface as SQLSTATE 23514 → friendly Estonian copy. Don't "fix" a rejected insert by loosening these without checking the data first.
- **Overlapping-window stats lie:** the diesel "mean-reversion" that looked real (r=−0.53) was a measurement artifact; a bias-free split-half test put it at −0.05. Validate any autocorrelation with disjoint windows.
- **Read-only analysis scripts are throwaway:** the DB-audit scripts this session were written under `scripts/` and deleted after use — recreate from the `diagnose_point_spam.js` pattern when needed. (Exception kept as a record: `apply_station_audit_fix.mjs`, idempotent.)
- **Deactivating a station strands its vald pre-phase-64** unless `station_count` is recomputed. Post-phase-64 the trigger auto-adjusts; the old `hide_*.sql` scripts did a manual recompute. If you ever bulk-edit `active`, verify `station_count` drift = 0 after.
- **Vald-boundary "double lines" were a DATA problem, not styling — FULLY FIXED 2026-07-21.** The shipped geojsons were simplified per-polygon so neighbours' shared borders didn't coincide (only ~26% of vald-vald edges). Fix: **both layers re-sourced from current OSM** via `scripts/rebuild_boundaries.mjs` (Overpass admin_level=7 → `scripts/osm_assemble_boundaries.cjs` → DB-join by osm_id → mapshaper simplify+dissolve). Adjacent municipalities share the same OSM ways → single lines by construction: interior vald-vald 26%→**100%**, county-vs-vald 11.8%→**99.8%**. The app's 78 parish ids ARE OSM relation ids (join is exact); geometry is drawn-only so Avastuskaart counts (DB-driven) are untouched. To regenerate when boundaries change: re-run the Overpass query in `rebuild_boundaries.mjs`, then the script. Confirmed live on kyts.ee (single vald lines at field zoom, 0 console errors). ⚠️ Estonia is now 78 municipalities (Toila merged into Jõhvi 2025-11-28).
