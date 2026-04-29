-- In-app reply channel for the phase 33 feedback table. Reads as a one-shot
-- toast in the kyts UI when the user signs in: "we got your feedback, here's
-- what we did". Cheaper than provisioning + monitoring an outbound mailbox
-- for kyts, and the visibility is tied to the user's existing kyts session
-- so there's no spam vector or deliverability worry.
--
-- Recipients are derived through `feedback.user_id`. Anonymous feedback
-- (where feedback.user_id is null) cannot receive a reply — there's no
-- identity to deliver to. That's a hard constraint, not a TODO: the SELECT
-- policy below requires a non-null match against the caller's auth.uid().
--
-- Authoring: replies are inserted manually in the SQL editor as
-- `service_role`. There's no INSERT/UPDATE policy for `authenticated`, so
-- regular users can't write or edit replies — only read their own and mark
-- them read via the helper function.
--
-- read_at: when the toast is dismissed in-app, the client calls
-- `mark_feedback_reply_read(reply_id)` which sets read_at = now(). The
-- function is SECURITY DEFINER + ownership-checked so users can only flip
-- their own replies; we keep it as a function (not a column-level RLS)
-- because Postgres RLS doesn't restrict which columns a policy can touch,
-- and we don't want users editing the message itself.

create table if not exists feedback_replies (
  id           uuid primary key default gen_random_uuid(),
  feedback_id  uuid not null references feedback(id) on delete cascade,
  message      text not null check (char_length(trim(message)) between 3 and 2000),
  created_at   timestamptz not null default now(),
  read_at      timestamptz null
);

create index if not exists idx_feedback_replies_feedback_id on feedback_replies(feedback_id);
-- Partial index keeps lookups for "any unread reply for this user" cheap as
-- the table grows; full-table scans for the dismissal banner are already
-- O(small) but the partial keeps it bounded.
create index if not exists idx_feedback_replies_unread
  on feedback_replies(feedback_id) where read_at is null;

alter table feedback_replies enable row level security;

drop policy if exists feedback_replies_select_recipient on feedback_replies;
create policy feedback_replies_select_recipient
  on feedback_replies for select
  to authenticated
  using (
    exists (
      select 1 from feedback f
      where f.id = feedback_replies.feedback_id
        and f.user_id = (select auth.uid())
    )
  );

grant select on feedback_replies to authenticated;

-- Mark-read helper: lets the recipient flip read_at without exposing the
-- whole row to UPDATE. Ownership-checked inside the function body. NULL
-- guard means the update is a no-op on already-read rows (idempotent).
create or replace function mark_feedback_reply_read(reply_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update feedback_replies
  set read_at = now()
  where id = reply_id
    and read_at is null
    and exists (
      select 1 from feedback f
      where f.id = feedback_replies.feedback_id
        and f.user_id = auth.uid()
    );
end;
$$;

grant execute on function mark_feedback_reply_read(uuid) to authenticated;

-- Convenience: returns all unread replies for the calling user with the
-- original feedback message inlined for context. Single round-trip on
-- sign-in. Uses SECURITY INVOKER (default) so RLS on both tables applies.
create or replace view v_my_unread_feedback_replies
with (security_invoker = true)
as
select
  fr.id            as reply_id,
  fr.feedback_id,
  fr.message       as reply_message,
  fr.created_at    as reply_created_at,
  f.message        as original_message,
  f.created_at     as original_created_at
from feedback_replies fr
join feedback f on f.id = fr.feedback_id
where fr.read_at is null
  and f.user_id = (select auth.uid())
order by fr.created_at desc;

grant select on v_my_unread_feedback_replies to authenticated;
