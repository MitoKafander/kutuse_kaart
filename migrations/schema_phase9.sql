-- Phase 9: Open prices and votes to anonymous users

-- 1. Allow anonymous price inserts (user_id becomes optional)
ALTER TABLE prices ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS: anyone can insert prices (logged in or not)
DROP POLICY IF EXISTS "Logged in users can insert prices." ON prices;
CREATE POLICY "Anyone can insert prices." ON prices FOR INSERT WITH CHECK (true);

-- 2. Allow anonymous votes (user_id becomes optional)
ALTER TABLE votes ALTER COLUMN user_id DROP NOT NULL;

-- Drop the old unique constraint and create a new one that only applies to logged-in users
ALTER TABLE votes DROP CONSTRAINT IF EXISTS unique_user_vote;
-- Re-add: only enforce uniqueness when user_id is NOT null
CREATE UNIQUE INDEX unique_user_vote_logged_in ON votes (price_id, user_id) WHERE user_id IS NOT NULL;

-- Update RLS: anyone can vote
DROP POLICY IF EXISTS "Logged in users can vote." ON votes;
CREATE POLICY "Anyone can vote." ON votes FOR INSERT WITH CHECK (true);

-- Keep the update policy for logged-in users only
DROP POLICY IF EXISTS "Users can update their own votes." ON votes;
CREATE POLICY "Users can update their own votes." ON votes FOR UPDATE USING (auth.uid() = user_id);
