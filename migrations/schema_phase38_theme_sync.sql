-- Phase 38: Cross-device theme sync.
-- Adds user_profiles.theme so signed-in users get their chosen theme back
-- on any device / any browser / after localStorage loss. Motivated by an
-- iOS-Safari home-screen-PWA report where the theme kept reverting to
-- system dark between launches — suspected scope-escape from a www-era
-- install (PWA manifest scope = www.kyts.ee, every launch redirects to
-- apex, theme writes land on one origin and reads come from the other).
--
-- This column on its own doesn't fully fix that specific case (if scope
-- escape also kills the Supabase session, there's nothing to read from)
-- — that friend still needs to delete + re-add the home screen icon from
-- https://kyts.ee — but it closes the simpler adjacent leaks for every
-- signed-in user on every other device: ITP 7-day localStorage eviction,
-- "clear cookies on close" privacy settings, and plain device-switch.
--
-- Nullable: NULL means "no server-side preference yet, respect whatever
-- localStorage / system has". Matches the early-days pattern already used
-- by `language` / `show_latvian_stations` / etc. Clients only apply the
-- value when it's non-null; toggles upsert it.
--
-- Rollback: `alter table user_profiles drop column theme;` — safe any
-- time, clients fall back to localStorage + system preference.

alter table user_profiles add column if not exists theme varchar(5);

alter table user_profiles drop constraint if exists user_profiles_theme_valid;
alter table user_profiles add constraint user_profiles_theme_valid
  check (theme is null or theme in ('dark', 'light'));
