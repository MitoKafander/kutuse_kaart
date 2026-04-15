-- Phase 24 — Hide no-data dots preference.
--
-- Mobile users with full zoomed-out map see hundreds of empty (no-price) dots
-- that slow pan/zoom. Add a per-user toggle (default ON) so the app hides
-- stations without fresh prices by default, with an opt-in to show them.

alter table user_profiles
  add column if not exists hide_empty_dots boolean not null default true;
