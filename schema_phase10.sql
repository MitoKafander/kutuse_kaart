-- Phase 10: Add auto_open_nearby preference to user_profiles
-- Run this in the Supabase SQL editor

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS auto_open_nearby boolean NOT NULL DEFAULT true;
