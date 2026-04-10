-- Phase 12: Dot style + clustering user preferences
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS dot_style TEXT DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS show_clusters BOOLEAN DEFAULT true;
