-- Phase 33: User feedback inbox. One table, public inserts, no client reads —
-- you triage feedback via the Supabase dashboard (service_role bypasses RLS).
-- Kept deliberately small: open text + optional user_id + user agent string
-- for debugging platform-specific complaints.

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Cheap message-length guard at the DB layer so clients can't dump MB of text.
ALTER TABLE feedback ADD CONSTRAINT feedback_message_len
  CHECK (char_length(message) BETWEEN 3 AND 2000);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can submit feedback. Tying it to auth.uid()
-- WITH CHECK means logged-in users can't spoof a different user_id, while
-- anon submissions must send user_id as NULL.
CREATE POLICY "feedback_insert_self_or_anon" ON feedback
  FOR INSERT
  WITH CHECK (
    (user_id IS NULL AND auth.uid() IS NULL)
    OR user_id = auth.uid()
  );

-- No SELECT / UPDATE / DELETE policies means no role short of service_role
-- can read the table from the client. You triage via the SQL editor.

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback (created_at DESC);
