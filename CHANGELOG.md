# Kyts Changelog

All notable changes to this project will be documented in this file.

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
