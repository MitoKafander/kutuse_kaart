-- Phase 27: per-user toggle to show/hide Latvian border-strip stations.
-- Default is true (show) since the stations are useful to most users near the border;
-- those who don't drive south can opt out in Profil → Seaded → Kuva.

alter table user_profiles
  add column if not exists show_latvian_stations boolean not null default true;
