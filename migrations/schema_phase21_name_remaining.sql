-- Final batch: name the remaining "Tundmatu" stations based on external lookup.
-- Sources: Gemini verification + OSM data that wasn't in our seed snapshot.

-- === Known chains: promote to the brand so loyalty/brand-filter works ===

-- Circle K Tartu Anne (Kalda tee)
update stations set name = 'Circle K'
where id = '88fdcbf4-eb73-424a-ba39-613a9c56f876';

-- Alexela Karksi-Nuia
update stations set name = 'Alexela'
where id = 'fc0df2fe-54e7-430e-80d5-2896e00351d9';

-- Olerex Vastseliina
update stations set name = 'Olerex'
where id = '4bf1b5a7-3fc3-4703-8562-bfcb630da842';

-- Krooning Rummu (independent chain — keep as its own brand)
update stations set name = 'Krooning'
where id = 'b505139b-5cdc-4c54-af4e-b79a88975664';

-- === Independent stations: use their actual name ===

-- Novotrade (Kohtla-Järve)
update stations set name = 'Novotrade'
where id = 'fd3b202c-e105-4e26-b6ed-8ba6a2ab6d0d';

-- Mirtezor (Kehra)
update stations set name = 'Mirtezor'
where id = '7f07d274-093f-4dd5-9410-85f995d1f62f';

-- Pajusti tankla
update stations set name = 'Pajusti tankla'
where id = '728f0833-7db2-4043-861c-3ab675c6436b';

-- Kudina tankla
update stations set name = 'Kudina tankla'
where id = 'b70e612b-8f47-45fc-a768-bf03cac525d5';

-- Abacus (Reola)
update stations set name = 'Abacus'
where id = '7886bff2-485f-44bf-a848-1c74e55db7d9';

-- Taikse küla rural "Tankla" — keep generic label, no better name exists
update stations set name = 'Tankla'
where id = '629ace5b-0eee-4059-91d9-28f52c82dc3e';

-- === Non-public locations mis-tagged in OSM as amenity=fuel — DELETE ===
-- These aren't retail fuel stations and shouldn't appear on the map.
-- ABB Drives and Renewables (industrial facility, Jüri)
-- Ämari Lennubaas (military airbase)
-- Tallinn Airport Aviation Fuel (jet fuel, not public)

delete from prices where station_id in (
  '70529c77-e328-4c6c-9712-edd7bd514dcb',
  'cead0c82-0ba1-4cd0-b742-00d79c3fb57e',
  '0d63e802-fbf8-48eb-a1f8-72fbd125653e'
);
delete from user_favorites where station_id in (
  '70529c77-e328-4c6c-9712-edd7bd514dcb',
  'cead0c82-0ba1-4cd0-b742-00d79c3fb57e',
  '0d63e802-fbf8-48eb-a1f8-72fbd125653e'
);
delete from stations where id in (
  '70529c77-e328-4c6c-9712-edd7bd514dcb',
  'cead0c82-0ba1-4cd0-b742-00d79c3fb57e',
  '0d63e802-fbf8-48eb-a1f8-72fbd125653e'
);

-- Verify no Tundmatu rows remain (except those with truly no info).
select id, name, latitude, longitude
from stations
where name = 'Tundmatu' or name is null;
