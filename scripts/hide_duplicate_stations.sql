-- OSM import brought in duplicate nodes where the same fuel station is mapped
-- twice (usually a richly-tagged way + a sparse node). These show up as two
-- pins within ~80m of each other with the same brand. Detection: same-brand
-- pairs within 80m sorted by amenities richness; drop the sparse side.
--
-- Confirmed with Mikk 2026-04-20. Circle K Järve automaat (Pärnu mnt 236) is
-- a legitimate card-only pump separate from the attended Circle K next door —
-- both kept. All others below are the sparse side of a same-brand pair.
update stations
  set active = false
  where id in (
    '1ff22cb5-107d-4527-925d-e82c25265d91', -- Olerex Lihula (bare, 3m from full row)
    'a61f02f8-9472-4143-a46a-033c782ba33c', -- Olerex Elva Valga mnt (bare, 4m)
    'bed1cbca-03c9-4417-add6-56dc9fc12fd8', -- HEPA Järvakandi (bare, 12m)
    '88fdcbf4-eb73-424a-ba39-613a9c56f876', -- Circle K Kalda tee Tartu (1-key stub, 14m)
    '47a42e01-bc8f-401e-a2d6-f12da8bd1ebb', -- Jõelähtme tankla (Kivisilla 1, 20m)
    'ef4d6531-f911-4853-9ea5-807a649f2fde', -- Terminal Oil Luunja (Jõesadama 12, 49m)
    '27dcb665-a528-411c-a038-23b0cf9c897c'  -- Alexela Kilksama (bare, 73m)
  );

-- Refresh denormalized counts.
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
