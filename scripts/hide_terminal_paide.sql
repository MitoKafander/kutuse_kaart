-- Terminal Oil Paide diislipunkt (Pärnuvälja 3) sits inside a closed
-- territory — not publicly accessible, so no point showing it on the map.
update stations
  set active = false
  where id = '52c4262a-2b4a-40ab-ad59-7f82285425c9';

-- Refresh parish/maakond counts.
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
