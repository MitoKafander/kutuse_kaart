-- Estonian Fuel Price Tracker - Database Schema

-- 1. Create the Stations Table
CREATE TABLE stations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  amenities JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- We add a unique constraint on coordinates to avoid duplicate stations during seeding
ALTER TABLE stations ADD CONSTRAINT unique_location UNIQUE (latitude, longitude);

-- 2. Create the Prices Table
CREATE TABLE prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  station_id UUID REFERENCES stations(id) ON DELETE CASCADE,
  fuel_type TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  -- user_id UUID REFERENCES auth.users(id), -- We'll add this later when we implement Auth
  reported_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Create the Votes/Trust Table
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  price_id UUID REFERENCES prices(id) ON DELETE CASCADE,
  -- user_id UUID REFERENCES auth.users(id), -- We'll add auth constraints later
  vote_type TEXT CHECK (vote_type IN ('up', 'down')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- --- ROW LEVEL SECURITY (RLS) ---
-- For now, we are making the tables readable by anyone since it's a public map.
-- We also allow inserting without auth for the initial seeding process.
-- Later, we will restrict inserts to only authenticated users.

ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public stations are viewable by everyone." 
ON stations FOR SELECT USING (true);

CREATE POLICY "Anyone can insert stations (for initial seeding)." 
ON stations FOR INSERT WITH CHECK (true);

CREATE POLICY "Public prices are viewable by everyone." 
ON prices FOR SELECT USING (true);

CREATE POLICY "Anyone can insert prices (for now)." 
ON prices FOR INSERT WITH CHECK (true);

CREATE POLICY "Votes are viewable by everyone." 
ON votes FOR SELECT USING (true);

CREATE POLICY "Anyone can vote (for now)." 
ON votes FOR INSERT WITH CHECK (true);
