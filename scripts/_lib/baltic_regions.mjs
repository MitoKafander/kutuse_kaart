// The Avastuskaart's level-1 region catalogs for Latvia and Lithuania, plus
// the loaders that turn the .osm-cache/ dumps into rows the seed can write.
//
// Level-1 ids are hand-allocated and must never be reused or renumbered —
// they're `maakonnad.id` (smallint) and `parishes.maakond_id` in prod, and
// `properties.maakond_id` inside the shipped boundary geojson:
//     EE 1-15   ·   LV 101-105   ·   LT 201-210
// Level-2 ids are OSM relation ids, exactly as Estonia's 78 parishes already
// are, so they survive a reseed and can be cross-referenced against OSM.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, ringsFromRelation, centroidOfRings, pointInRings } from './overpass.mjs';

// ── Latvia ───────────────────────────────────────────────────────────────────
//
// Latvia has no admin_level=4 in OSM, so its level-1 tier comes from the five
// statutory planning regions (plānošanas reģioni). That grouping is law, not
// geometry, so it lives here as a table rather than being derived — and the
// loader below fails loudly if OSM's municipality list ever stops matching it
// exactly in both directions, which is what keeps this table honest.
export const LV_REGIONS = [
  { id: 101, name: 'Kurzemes reģions', emoji: '🌊' },
  { id: 102, name: 'Latgales reģions', emoji: '🏞️' },
  { id: 103, name: 'Rīgas reģions',    emoji: '🏙️' },
  { id: 104, name: 'Vidzemes reģions', emoji: '🌲' },
  { id: 105, name: 'Zemgales reģions', emoji: '🌾' },
];

export const LV_MUNICIPALITY_REGION = {
  // Rīgas plānošanas reģions (Rīga + Pierīga)
  'Rīga': 103, 'Jūrmala': 103, 'Ādažu novads': 103, 'Ķekavas novads': 103,
  'Mārupes novads': 103, 'Olaines novads': 103, 'Ogres novads': 103,
  'Ropažu novads': 103, 'Salaspils novads': 103, 'Saulkrastu novads': 103,
  'Siguldas novads': 103, 'Limbažu novads': 103, 'Tukuma novads': 103,
  // Vidzemes plānošanas reģions
  'Alūksnes novads': 104, 'Cēsu novads': 104, 'Gulbenes novads': 104,
  'Madonas novads': 104, 'Smiltenes novads': 104, 'Valkas novads': 104,
  'Valmieras novads': 104,
  // Kurzemes plānošanas reģions
  'Dienvidkurzemes novads': 101, 'Kuldīgas novads': 101, 'Liepāja': 101,
  'Saldus novads': 101, 'Talsu novads': 101, 'Ventspils': 101,
  'Ventspils novads': 101,
  // Zemgales plānošanas reģions
  'Aizkraukles novads': 105, 'Bauskas novads': 105, 'Dobeles novads': 105,
  'Jelgava': 105, 'Jelgavas novads': 105, 'Jēkabpils novads': 105,
  // Latgales plānošanas reģions
  'Augšdaugavas novads': 102, 'Balvu novads': 102, 'Daugavpils': 102,
  'Krāslavas novads': 102, 'Līvānu novads': 102, 'Ludzas novads': 102,
  'Preiļu novads': 102, 'Rēzekne': 102, 'Rēzeknes novads': 102,
};

// ── Lithuania ────────────────────────────────────────────────────────────────
//
// Lithuania DOES map admin_level=4 (10 apskritys), so its level-1 tier is read
// from OSM and only the id allocation lives here — keyed by OSM name so a
// reseed can't renumber a county behind our backs.
export const LT_COUNTY_IDS = {
  'Alytaus apskritis':      201,
  'Kauno apskritis':        202,
  'Klaipėdos apskritis':    203,
  'Marijampolės apskritis': 204,
  'Panevėžio apskritis':    205,
  'Šiaulių apskritis':      206,
  'Tauragės apskritis':     207,
  'Telšių apskritis':       208,
  'Utenos apskritis':       209,
  'Vilniaus apskritis':     210,
};

export const LT_COUNTY_EMOJI = {
  201: '🍎', 202: '🏰', 203: '⚓', 204: '🌻', 205: '🌾',
  206: '🚲', 207: '🌿', 208: '🐻', 209: '🏞️', 210: '🏙️',
};

function loadCache(name) {
  return JSON.parse(readFileSync(join(CACHE_DIR, name), 'utf8'));
}

/**
 * Municipalities (level 2) with their stitched boundary rings, for one country.
 * Throws rather than returning a short list — a partial region catalog would
 * silently shrink Avastuskaart denominators.
 */
export function loadMunicipalities(cc) {
  const raw = loadCache(`${cc}_municipalities.json`);
  const out = [];
  for (const rel of raw.elements) {
    if (rel.type !== 'relation' || !rel.tags?.name) continue;
    const rings = ringsFromRelation(rel);
    if (!rings.outer.length) throw new Error(`${cc}: ${rel.tags.name} (${rel.id}) produced no closed ring`);
    out.push({
      id: rel.id,
      name: rel.tags.name,
      rings,
      centroid: centroidOfRings(rings),
      tags: rel.tags,
    });
  }
  if (!out.length) throw new Error(`${cc}: no municipalities in cache`);
  return out;
}

/** Latvia: attach each municipality to its planning region via the table above. */
export function assignLatvianRegions(municipalities) {
  const unknown = municipalities.filter((m) => !LV_MUNICIPALITY_REGION[m.name]);
  if (unknown.length) {
    throw new Error(
      `LV: OSM has municipalities missing from LV_MUNICIPALITY_REGION: ${unknown.map((m) => m.name).join(', ')}`,
    );
  }
  const osmNames = new Set(municipalities.map((m) => m.name));
  const stale = Object.keys(LV_MUNICIPALITY_REGION).filter((n) => !osmNames.has(n));
  if (stale.length) {
    throw new Error(`LV: LV_MUNICIPALITY_REGION lists municipalities OSM no longer has: ${stale.join(', ')}`);
  }
  return municipalities.map((m) => ({ ...m, regionId: LV_MUNICIPALITY_REGION[m.name] }));
}

/**
 * Lithuania: attach each municipality to the county its centroid falls inside.
 *
 * Geometry decides, because Overpass `map_to_area` membership lists a
 * municipality under every county it merely touches. That membership dump is
 * still loaded as a cross-check: a centroid result the membership doesn't
 * corroborate at all means something is wrong with the geometry and we stop.
 */
export function assignLithuanianCounties(municipalities) {
  const countiesRaw = loadCache('LT_counties_geom.json');
  const counties = countiesRaw.elements
    .filter((e) => e.type === 'relation' && e.tags?.name)
    .map((rel) => {
      const id = LT_COUNTY_IDS[rel.tags.name];
      if (!id) throw new Error(`LT: unknown county in OSM: ${rel.tags.name}`);
      return { id, name: rel.tags.name, rings: ringsFromRelation(rel) };
    });
  if (counties.length !== Object.keys(LT_COUNTY_IDS).length) {
    throw new Error(`LT: expected ${Object.keys(LT_COUNTY_IDS).length} counties, got ${counties.length}`);
  }

  // Cross-check source: {municipality osm id -> Set(county name)}.
  const membership = new Map();
  let currentCounty = null;
  for (const e of loadCache('LT_county_members.json').elements) {
    const lvl = e.tags?.admin_level;
    if (lvl === '4') { currentCounty = e.tags?.name ?? null; continue; }
    if (lvl === '5' && currentCounty) {
      if (!membership.has(e.id)) membership.set(e.id, new Set());
      membership.get(e.id).add(currentCounty);
    }
  }

  return municipalities.map((m) => {
    const [lon, lat] = m.centroid;
    let hit = counties.find((c) => pointInRings(lon, lat, c.rings));
    // A centroid can land outside its own municipality for a crescent-shaped
    // unit (a ring municipality wrapped around a city). Fall back to the
    // county that contains the most of its boundary vertices.
    if (!hit) {
      const tally = new Map();
      const sample = m.rings.outer[0].filter((_, i) => i % 5 === 0);
      for (const [x, y] of sample) {
        const c = counties.find((cc2) => pointInRings(x, y, cc2.rings));
        if (c) tally.set(c.id, (tally.get(c.id) || 0) + 1);
      }
      const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      hit = best ? counties.find((c) => c.id === best[0]) : undefined;
    }
    if (!hit) throw new Error(`LT: could not place ${m.name} (${m.id}) in any county`);

    const touching = membership.get(m.id);
    if (touching && !touching.has(hit.name)) {
      throw new Error(
        `LT: ${m.name} placed in ${hit.name} by geometry, but Overpass membership says ${[...touching].join('/')}`,
      );
    }
    return { ...m, regionId: hit.id };
  });
}

/** Level-1 catalog rows for a country, ready to upsert into `maakonnad`. */
export function level1Rows(cc, municipalities) {
  if (cc === 'LV') return LV_REGIONS.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, country: 'LV' }));
  if (cc === 'LT') {
    const used = new Set(municipalities.map((m) => m.regionId));
    return Object.entries(LT_COUNTY_IDS)
      .filter(([, id]) => used.has(id))
      .map(([name, id]) => ({ id, name, emoji: LT_COUNTY_EMOJI[id] ?? '📍', country: 'LT' }));
  }
  throw new Error(`No level-1 catalog for ${cc}`);
}

/** Full pipeline: cache -> municipalities with a regionId attached. */
export function loadRegionTree(cc) {
  const municipalities = loadMunicipalities(cc);
  const withRegion = cc === 'LV' ? assignLatvianRegions(municipalities) : assignLithuanianCounties(municipalities);
  return { municipalities: withRegion, level1: level1Rows(cc, withRegion) };
}
