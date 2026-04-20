-- Hide CNG/LNG/biogas-only stations. The app scope is liquid fuels (95/98/
-- Diisel/LPG); gas-only stations can't receive price reports and skew parish/
-- maakond discovery totals. Detection: station has a gas fuel tag AND no
-- liquid-fuel tag in its OSM amenities JSON.
--
-- Station names confirm the classification — every matched row has "CNG" in
-- its name (e.g. "Tartu CNG tankla", "JetGAS CNG", "Alexela CNG").
update stations
  set active = false
  where active = true
    and (
      amenities->>'fuel:cng' = 'yes'
      or amenities->>'fuel:lng' = 'yes'
      or amenities->>'fuel:biogas' = 'yes'
    )
    and not (
      amenities->>'fuel:diesel' = 'yes'
      or amenities->>'fuel:octane_91' = 'yes'
      or amenities->>'fuel:octane_95' = 'yes'
      or amenities->>'fuel:octane_98' = 'yes'
      or amenities->>'fuel:lpg' = 'yes'
      or amenities->>'fuel:e85' = 'yes'
      or amenities->>'fuel:HGV_diesel' = 'yes'
    );

-- Refresh denormalized parish/maakond counts so discovery progress ("X/Y jaama
-- avastatud") reflects the new station set.
update parishes p
  set station_count = coalesce(
    (select count(*) from stations s where s.parish_id = p.id and s.country = 'EE' and s.active),
    0
  );
update maakonnad m
  set station_count = coalesce(
    (select sum(p.station_count) from parishes p where p.maakond_id = m.id),
    0
  );
