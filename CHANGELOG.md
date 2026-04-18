# Kyts Changelog

All notable changes to this project will be documented in this file.

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
- 🔴 **Privacy Policy rewritten** (`src/components/PrivacyModal.tsx`): Now identifies data controller (Mikk Rosin, info@kyts.ee, www.kyts.ee), lists all sub-processors (Supabase, Vercel, Google, Upstash, Sentry, PostHog), adds retention periods, GDPR legal bases (art 6(1)(b) + (f)), and complaint route (aki.ee). Old text claimed cookies were used for tracking — corrected to reflect cookieless analytics.
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
