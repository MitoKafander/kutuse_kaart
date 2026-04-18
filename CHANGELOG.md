# Kyts Changelog

All notable changes to this project will be documented in this file.

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
