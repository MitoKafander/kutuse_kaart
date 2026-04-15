# Kyts ⛽️

Kyts (formerly KütuseKaart / Fuel Map) is a community-driven, crowd-sourced application for tracking real-time fuel prices across Estonia. Built with a modern tech stack and progressive web app (PWA) capabilities, it allows users to find the absolute cheapest fuel, verify community data, and contribute to the ecosystem.

## Live Application
🌍 **[https://kyts.ee](https://kyts.ee)**  
📱 Designed mobile-first. Installable as a Progressive Web App (PWA) on iOS & Android.

## Core Features
1. **Interactive Map**: Seamless interface powered by Leaflet to explore 500+ gas stations across Estonia (Circle K, Neste, Olerex, etc.).
2. **AI Vision Scanning**: Open your device's camera, snap a photo of a gas station totem, and local Vercel nodes pass the image securely to **Gemini 2.5 Flash** to automatically read and hydrate the form pricing — with automatic brand cross-validation. Includes auto-retry on server errors and photo persistence for manual verification.
3. **Camera Quick-Scan**: A dedicated camera button on the main map lets you scan prices without first selecting a station. GPS + AI brand detection automatically matches the closest station.
4. **Driving Mode**: On app launch, a "Cheapest Nearby" panel shows the cheapest station per fuel type (95, 98, Diesel, LPG) within a selectable radius (5/10/20 km) with one-tap navigation to Google Maps. Supports preferred brand filtering.
5. **User Profile & Favorites**: Logged-in users get a personal dashboard with favorite stations (showing live prices), a contribution score, preferred fuel type, and preferred station brands for driving mode.
6. **Advanced Filtering**: 
   - **Traffic Light System**: Instantly hide prices that are over 24 hours old so you only see active, verified data.
   - **Cheapest Finder**: Select a fuel type, and the app mathematically highlights the absolute cheapest station across the visible map with a glowing gold marker. The top-5 cheapest stations show price pills even when zoomed out.
7. **Reputation & Voting**: Users must securely log in to submit a price or vote (Thumbs Up / Thumbs Down) on existing data. A strict one-vote-per-user database constraint ensures community integrity.
8. **Geolocation**: One-tap locator passively traces your device's GPS hardware for instant 0-second re-centering.
9. **GDPR Compliance**: Estonian-language Terms of Service + Privacy Policy, cookieless analytics (no consent banner required for tracking), and a first-visit acknowledgement for the essential auth cookies.
10. **Ops Hardening**: Per-IP + global rate limits on the AI endpoint (Upstash Redis), error monitoring (Sentry), and anonymous product analytics (PostHog EU Cloud, memory persistence — no cookies).

## Tech Stack
*   **Frontend**: React + TypeScript + Vite
*   **Styling**: Vanilla CSS (Tailored dark-theme glassmorphism)
*   **AI Engine**: Google Gemini 2.5 Flash (`@google/generative-ai`)
*   **Map Engine**: React-Leaflet
*   **Backend & DB**: Supabase (PostgreSQL with Row Level Security)
*   **Authentication**: Supabase Auth (Email / Password & Google OAuth)
*   **Serverless**: Vercel Edge API Functions
*   **Rate Limiting**: Upstash Redis + `@upstash/ratelimit` (sliding window per-IP + daily global cap)
*   **Error Monitoring**: Sentry (`@sentry/react`, replays off)
*   **Analytics**: PostHog EU Cloud (cookieless, memory persistence, autocapture off)

## Local Development
If you wish to spin up a local instance of the application:
1. Clone the repository.
2. Link to your local or hosted Supabase database using `.env` variables:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   GEMINI_API_KEY=your_google_ai_studio_key
   ```
3. Run `npm install` then `npm run dev`.

### Database Schema
The project schema relies on five tables governed by Row Level Security (RLS). Migrations live in `migrations/` and are applied manually in the Supabase SQL editor (`schema.sql` through `schema_phase20_unknown_targeted.sql`).
*   `stations` (Base OpenStreetMap derived locations)
*   `prices` (Tied to user_id for submission tracking)
*   `votes` (Unique constraint across user_id + price_id)
*   `user_profiles` (Default fuel type, preferred brands, auto-open toggle per user)
*   `user_favorites` (Bookmarked stations per user)

---
*Built via an autonomous pairing session for advanced web application architecture.*
