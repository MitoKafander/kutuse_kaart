-- Phase 36: public (user_id, display_name) lookup view for price attribution.
-- The `user_profiles` table has row-level SELECT policy gated to `auth.uid() = id`
-- (phase 8), so anonymous viewers and signed-in users looking at anyone else's
-- rows can't read display_name directly. The leaderboard views bypass this via a
-- coalesce subquery but cap at 100 rows — not enough to attribute every price in
-- the app. This view exposes (user_id, display_name) for every profile that has
-- reported at least one price, with the same fallback chain the leaderboard uses
-- (user_profiles.display_name → auth.raw_user_meta_data.display_name → 'Anonüümne').
--
-- Consumers: StationDrawer fuel tiles, CheapestNearbyPanel result rows,
-- ProfileDrawer favorites, RoutePlanModal route results — anywhere a price
-- needs a "Teatas: X" reporter credit.

create or replace view v_reporters as
select
  p.user_id,
  coalesce(
    (select display_name from user_profiles where id = p.user_id),
    u.raw_user_meta_data->>'display_name',
    'Anonüümne'
  ) as display_name
from (select distinct user_id from prices where user_id is not null) p
left join auth.users u on u.id = p.user_id;

grant select on v_reporters to anon, authenticated;
