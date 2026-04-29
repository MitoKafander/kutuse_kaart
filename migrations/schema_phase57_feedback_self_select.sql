-- Hotfix for phase 56: feedback_replies' SELECT policy does an EXISTS
-- subquery against `feedback` to confirm the caller owns the feedback row,
-- but phase 33 created `feedback` insert-only (no SELECT policy). Without
-- a SELECT policy on `feedback`, RLS blocks the EXISTS subquery itself —
-- so users can't read their own feedback_replies even though they should.
-- Symptom: FeedbackReplyToast queries v_my_unread_feedback_replies and
-- gets zero rows even when the unread reply exists in the table.
--
-- Fix: let signed-in users SELECT their own feedback rows. Anonymous
-- feedback (user_id IS NULL) stays invisible to all authenticated callers
-- — only service_role sees those. Triage continues to run via service_role
-- in the SQL editor as before; nothing about admin access changes.

drop policy if exists feedback_select_self on feedback;
create policy feedback_select_self
  on feedback for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on feedback to authenticated;
