# KütuseKaart ⛽️

KütuseKaart (Fuel Map) is a community-driven, crowd-sourced application for tracking real-time fuel prices across Estonia. Built with a modern tech stack and progressive web app (PWA) capabilities, it allows users to find the absolute cheapest fuel, verify community data, and contribute to the ecosystem.

## Live Application
🌍 **[https://kutuse-kaart.vercel.app](https://kutuse-kaart.vercel.app)**  
📱 Designed mobile-first. Installable as a Progressive Web App (PWA) on iOS & Android.

## Core Features
1. **Interactive Map**: Seamless interface powered by Leaflet to explore 500+ gas stations across Estonia (Circle K, Neste, Olerex, etc.).
2. **Advanced Filtering**: 
   - **Traffic Light System**: Instantly hide prices that are over 24 hours old so you only see active, verified data.
   - **Cheapest Finder**: Select a fuel type, and the app mathematically highlights the absolute cheapest station recursively across the entire visible map with a glowing gold marker.
3. **Reputation & Voting**: Users must securely log in to submit a price or vote (Thumbs Up / Thumbs Down) on exiting data. A strict one-vote-per-user database constraint ensures community integrity.
4. **Geolocation**: One-tap locator centers the map dynamically onto your current physical GPS coordinates.

## Tech Stack
*   **Frontend**: React + TypeScript + Vite
*   **Styling**: Vanilla CSS (Tailored dark-theme glassmorphism)
*   **Icons**: Lucide-React
*   **Map Engine**: React-Leaflet
*   **Backend & DB**: Supabase (PostgreSQL with Row Level Security)
*   **Authentication**: Supabase Auth (Email / Password & Google OAuth)
*   **Hosting**: Vercel

## Local Development
If you wish to spin up a local instance of the application:
1. Clone the repository.
2. Link to your local or hosted Supabase database using `.env` variables:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Run `npm install` then `npm run dev`.

### Database Schema
The project schema relies on three primary tables governed by Row Level Security (RLS). You can find the raw queries under `schema.sql` and `schema_phase3.sql`.
*   `stations` (Base OpenStreetMap derived locations)
*   `prices` (Tied to user_id for submission tracking)
*   `votes` (Unique constraint across user_id + price_id)

---
*Built via an autonomous pairing session for advanced web application architecture.*
