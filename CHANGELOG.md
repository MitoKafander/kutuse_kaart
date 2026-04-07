# KütuseKaart Changelog

All notable changes to this project will be documented in this file.

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
