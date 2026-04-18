-- Phase 35: per-user language preference for the app UI.
-- Default 'et' (Estonian) since the existing user base is Estonian; English
-- (and future RU/FI/LV) can be selected in Profil → Seaded → Keel.
-- Length 5 leaves room for region-tagged BCP-47 codes if we ever ship
-- region-specific variants (e.g. 'en-US' vs 'en-GB'); plain 2-letter codes
-- are the norm.

alter table user_profiles
  add column if not exists language varchar(5) not null default 'et';
