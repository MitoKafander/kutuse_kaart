# KütuseKaart Changelog

All notable changes to this project will be documented in this file.

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
