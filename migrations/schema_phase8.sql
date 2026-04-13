-- Phase 8 Migration: User Favorites and Preferences

-- 1. Create User Profiles (for preferences like default fuel)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  default_fuel_type TEXT
);

-- RLS for Profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile." ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile." ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile." ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Create User Favorites table
CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  station_id UUID REFERENCES stations(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, station_id)
);

-- RLS for Favorites
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own favorites." ON user_favorites FOR ALL USING (auth.uid() = user_id);
