-- Phase 11 Migration: Preferred Station Brands for Driving Mode
-- Stores user's preferred fuel station brands (e.g. Circle K, Neste)
-- Used to filter the "cheapest nearby" panel results

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS preferred_brands text[] NOT NULL DEFAULT '{}';
