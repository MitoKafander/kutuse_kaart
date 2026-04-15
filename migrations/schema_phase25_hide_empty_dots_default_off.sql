-- Phase 25 — Flip hide_empty_dots default to OFF.
--
-- Originally shipped default ON to tame mobile clutter, but hiding no-data
-- stations also hides the opportunity to be the first to submit a price
-- there. Default off keeps discovery intact; users can still opt in.

alter table user_profiles
  alter column hide_empty_dots set default false;

update user_profiles
  set hide_empty_dots = false
  where hide_empty_dots = true;
