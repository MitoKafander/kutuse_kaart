-- Phase 3 Migration: Adding user tracking to prices and votes

-- 1. Add user_id to prices
ALTER TABLE prices ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- 2. Add user_id to votes and enforce uniqueness
ALTER TABLE votes ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Prevent a user from voting on the same exact submitted price more than once
ALTER TABLE votes ADD CONSTRAINT unique_user_vote UNIQUE (price_id, user_id);

-- 3. Modify Row Level Security Policies
-- (We gave everyone insert rights in Phase 1, let's lock it down to authenticated users now)
DROP POLICY "Anyone can insert prices (for now)." ON prices;
CREATE POLICY "Logged in users can insert prices." 
ON prices FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY "Anyone can vote (for now)." ON votes;
CREATE POLICY "Logged in users can vote." 
ON votes FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Added: Ability to update their own vote 
CREATE POLICY "Users can update their own votes." 
ON votes FOR UPDATE USING (auth.uid() = user_id);
