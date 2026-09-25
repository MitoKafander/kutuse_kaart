// The Avastuskaart's level-1 region catalogs for Latvia and Lithuania, plus
// the loaders that turn the .osm-cache/ dumps into rows the seed can write.
//
// Level-1 ids are hand-allocated and must never be reused or renumbered —
// they're `maakonnad.id` (smallint) and `parishes.maakond_id` in prod, and
// `properties.maakond_id` inside the shipped boundary geojson:
//     EE 1-15   ·   LV 101-105   ·   LT 201-210   ·   FI 301-319
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

// ── Finland ──────────────────────────────────────────────────────────────────
//
// Like Lithuania, Finland maps its level-1 tier in OSM (19 maakunnat at
// admin_level=4), so only the id allocation lives here. Its level-2 tier is
// admin_level=8 (308 kunnat) — NOT 5, which Finland does not have, and not 7,
// which is a partial cover of only 69 units.
export const FI_REGION_IDS = {
  // Names exactly as OSM carries them — Finnish without the "maakunta" suffix,
  // and Swedish for the two Swedish-speaking regions (Åland and Ostrobothnia),
  // which is how OSM tags them. Read from the cache rather than guessed; my
  // first attempt used the genitive forms and failed on "Uusimaa".
  'Etelä-Karjala': 301,
  'Etelä-Pohjanmaa': 302,
  'Etelä-Savo': 303,
  'Kainuu': 304,
  'Kanta-Häme': 305,
  'Keski-Pohjanmaa': 306,
  'Keski-Suomi': 307,
  'Kymenlaakso': 308,
  'Landskapet Åland': 309,
  'Lappi': 310,
  'Pirkanmaa': 311,
  'Pohjois-Karjala': 312,
  'Pohjois-Pohjanmaa': 313,
  'Pohjois-Savo': 314,
  'Päijät-Häme': 315,
  'Satakunta': 316,
  'Uusimaa': 317,
  'Varsinais-Suomi': 318,
  'Österbotten': 319,
};

export const FI_REGION_EMOJI = {
  301: '🏞️', 302: '🌾', 303: '🛶', 304: '🐻', 305: '🏰', 306: '🌊', 307: '🏑',
  308: '⚓', 309: '⛵', 310: '🦌', 311: '🏭', 312: '🎻', 313: '❄️', 314: '🥔',
  315: '🎿', 316: '🚢', 317: '🏙️', 318: '🗼', 319: '🐟',
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
export function assignOsmLevel1(cc, municipalities, idTable) {
  const countiesRaw = loadCache(`${cc}_counties_geom.json`);
  const counties = countiesRaw.elements
    .filter((e) => e.type === 'relation' && e.tags?.name)
    .map((rel) => {
      const id = idTable[rel.tags.name];
      if (!id) throw new Error(`${cc}: unknown level-1 region in OSM: ${rel.tags.name}`);
      return { id, name: rel.tags.name, rings: ringsFromRelation(rel) };
    });
  if (counties.length !== Object.keys(idTable).length) {
    throw new Error(`${cc}: expected ${Object.keys(idTable).length} level-1 regions, got ${counties.length}`);
  }

  // Cross-check source: {municipality osm id -> Set(county name)}.
  const membership = new Map();
  let currentCounty = null;
  for (const e of loadCache(`${cc}_county_members.json`).elements) {
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
    if (!hit) throw new Error(`${cc}: could not place ${m.name} (${m.id}) in any level-1 region`);

    const touching = membership.get(m.id);
    if (touching && !touching.has(hit.name)) {
      throw new Error(
        `${cc}: ${m.name} placed in ${hit.name} by geometry, but Overpass membership says ${[...touching].join('/')}`,
      );
    }
    return { ...m, regionId: hit.id };
  });
}

/** Level-1 catalog rows for a country, ready to upsert into `maakonnad`. */
/** Countries whose level-1 tier OSM maps, with their id and emoji tables. */
const OSM_LEVEL1 = {
  LT: { ids: LT_COUNTY_IDS, emoji: LT_COUNTY_EMOJI },
  FI: { ids: FI_REGION_IDS, emoji: FI_REGION_EMOJI },
};

export function level1Rows(cc, municipalities) {
  if (cc === 'LV') return LV_REGIONS.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, country: 'LV' }));
  const spec = OSM_LEVEL1[cc];
  if (!spec) throw new Error(`No level-1 catalog for ${cc}`);
  const used = new Set(municipalities.map((m) => m.regionId));
  return Object.entries(spec.ids)
    .filter(([, id]) => used.has(id))
    .map(([name, id]) => ({ id, name, emoji: spec.emoji[id] ?? '📍', country: cc }));
}

/** Full pipeline: cache -> municipalities with a regionId attached. */
/**
 * Every country these seeders know how to build, and the default set when a
 * script is run with no positional argument.
 *
 * Estonia is deliberately absent: its catalog predates this pipeline and is
 * maintained by `rebuild_boundaries.mjs`. Add a country here the moment its
 * region tree exists — the four scripts each kept their own literal list until
 * Finland, and three of them were still defaulting to ['LV','LT'] after it
 * shipped, so a bare re-run fetched Finland's OSM and then seeded nothing.
 */
export const SEEDABLE_COUNTRIES = ['LV', 'LT', 'FI'];

export function loadRegionTree(cc) {
  const municipalities = loadMunicipalities(cc);
  const withRegion = cc === 'LV'
    ? assignLatvianRegions(municipalities)                       // statutory table, no OSM level 1
    : assignOsmLevel1(cc, municipalities, OSM_LEVEL1[cc].ids);   // LT, FI: geometry decides
  return { municipalities: withRegion, level1: level1Rows(cc, withRegion) };
}
