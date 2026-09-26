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
/**
 * Sweden's 21 län, keyed by the statutory SCB code.
 *
 * Sweden DOES have admin_level=4 in OSM, but we do not use it. Every kommun
 * carries `ref:scb`, the four-digit SCB kommunkod whose first two digits ARE the
 * län code — so the grouping comes from government data rather than from
 * centroid-in-polygon inference, which is both exact and immune to a boundary
 * relation being mid-edit upstream. Verified against the cache: 290 kommuner map
 * onto exactly these 21 codes, none missing, none unexpected, and the counts
 * match the statutory figures (Stockholm 26, Västra Götaland 49, Skåne 33,
 * Gotland 1 — Gotland being simultaneously a län and a single kommun).
 *
 * Codes 02, 11, 15 and 16 are deliberately absent: they were retired in
 * historical county mergers and no kommun carries them.
 */
/**
 * Malta's six regions (Local Councils Act as amended 2021) and the 68 kunsilli
 * lokali beneath them.
 *
 * Malta has NO OSM tier above admin_level=8 — levels 4, 5, 6, 7, 9 and 10 all
 * return zero relations — so like Latvia it needs a statutory grouping. Unlike
 * Latvia, the mapping was not written from memory: it came from Wikidata's P131
 * on each council's `wikidata` tag, which returned all 68 with exactly one
 * current region each. That matters, because from memory I would have written
 * the superseded FIVE-region structure; the 2021 reform made it six.
 *
 * Cross-checked independently where geometry can settle it: Wikidata puts 14
 * councils in Gozo Region, and exactly 14 councils sit north-west of the
 * Malta-Gozo channel. Sourced data and geometry agree.
 */
export const MT_REGIONS = [
  { id: 501, name: 'Reġjun Lvant', emoji: '🌅' },
  { id: 502, name: 'Reġjun Tramuntana', emoji: '🏖️' },
  { id: 503, name: 'Reġjun Port', emoji: '⚓' },
  { id: 504, name: 'Reġjun Nofsinhar', emoji: '🏛️' },
  { id: 505, name: 'Reġjun Punent', emoji: '🌾' },
  { id: 506, name: 'Reġjun Għawdex', emoji: '⛴️' },
];

/**
 * Malta's 68 kunsilli lokali, keyed by ISO 3166-2 — NOT by name.
 *
 * Two councils share the name 'Ir-Rabat' (MT-45 Victoria on Gozo, MT-46 Rabat
 * on Malta) and two are 'Żebbuġ' in English (MT-65 Gozo, MT-66 Malta), so the
 * name-keyed shape Latvia uses would silently collapse them into one entry.
 * The ISO code is carried by all 68 OSM relations and is unambiguous.
 */
export const MT_COUNCIL_REGION = {
  'MT-01': 502,      // Attard
  'MT-02': 502,      // Balzan
  'MT-03': 503,      // Birgu
  'MT-04': 501,      // Birkirkara
  'MT-05': 504,      // Birżebbuġa
  'MT-06': 503,      // Cospicua
  'MT-07': 505,      // Dingli
  'MT-08': 503,      // Fgura
  'MT-09': 503,      // Floriana
  'MT-10': 506,      // Fontana
  'MT-11': 504,      // Gudja
  'MT-12': 501,      // Gżira
  'MT-13': 506,      // Għajnsielem
  'MT-14': 506,      // Għarb
  'MT-15': 501,      // Għargħur
  'MT-16': 506,      // Għasri
  'MT-17': 504,      // Għaxaq
  'MT-18': 504,      // Ħamrun
  'MT-19': 501,      // Iklin
  'MT-20': 503,      // Senglea
  'MT-21': 503,      // Kalkara
  'MT-22': 506,      // Kerċem
  'MT-23': 505,      // Kirkop
  'MT-24': 501,      // Lija
  'MT-25': 504,      // Luqa
  'MT-26': 504,      // Marsa
  'MT-27': 504,      // Marsascala
  'MT-28': 504,      // Marsaxlokk
  'MT-29': 505,      // Mdina
  'MT-30': 502,      // Mellieħa
  'MT-31': 502,      // Mġarr
  'MT-32': 502,      // Mosta
  'MT-33': 505,      // Mqabba
  'MT-34': 501,      // Msida
  'MT-35': 502,      // Mtarfa
  'MT-36': 506,      // Munxar
  'MT-37': 506,      // Nadur
  'MT-38': 502,      // Naxxar
  'MT-39': 503,      // Paola
  'MT-40': 501,      // Pembroke
  'MT-41': 501,      // Pietà
  'MT-42': 506,      // Qala
  'MT-43': 504,      // Qormi
  'MT-44': 505,      // Qrendi
  'MT-45': 506,      // Victoria
  'MT-46': 505,      // Rabat
  'MT-47': 505,      // Safi
  'MT-48': 501,      // Saint Julian's
  'MT-49': 502,      // San Ġwann
  'MT-50': 506,      // Saint Lawrence
  'MT-51': 502,      // Saint Paul's Bay
  'MT-52': 506,      // Sannat
  'MT-53': 504,      // Santa Luċija
  'MT-54': 504,      // Santa Venera
  'MT-55': 505,      // Siġġiewi
  'MT-56': 501,      // Sliema
  'MT-57': 501,      // Swieqi
  'MT-58': 501,      // Ta' Xbiex
  'MT-59': 503,      // Tarxien
  'MT-60': 503,      // Valletta
  'MT-61': 506,      // Xagħra
  'MT-62': 506,      // Xewkija
  'MT-63': 503,      // Xgħajra
  'MT-64': 503,      // Żabbar
  'MT-65': 506,      // Żebbuġ
  'MT-66': 505,      // Żebbuġ
  'MT-67': 504,      // Żejtun
  'MT-68': 505,      // Żurrieq
};

export const SE_LAN = [
  { code: '01', id: 401, name: 'Stockholms län',       emoji: '🏙️' },
  { code: '03', id: 402, name: 'Uppsala län',          emoji: '🎓' },
  { code: '04', id: 403, name: 'Södermanlands län',    emoji: '🏰' },
  { code: '05', id: 404, name: 'Östergötlands län',    emoji: '🌾' },
  { code: '06', id: 405, name: 'Jönköpings län',       emoji: '🪑' },
  { code: '07', id: 406, name: 'Kronobergs län',       emoji: '🌲' },
  { code: '08', id: 407, name: 'Kalmar län',           emoji: '🏯' },
  { code: '09', id: 408, name: 'Gotlands län',         emoji: '🐏' },
  { code: '10', id: 409, name: 'Blekinge län',         emoji: '⚓' },
  { code: '12', id: 410, name: 'Skåne län',            emoji: '🌷' },
  { code: '13', id: 411, name: 'Hallands län',         emoji: '🏖️' },
  { code: '14', id: 412, name: 'Västra Götalands län', emoji: '🚢' },
  { code: '17', id: 413, name: 'Värmlands län',        emoji: '🌳' },
  { code: '18', id: 414, name: 'Örebro län',           emoji: '🏭' },
  { code: '19', id: 415, name: 'Västmanlands län',     emoji: '⛏️' },
  { code: '20', id: 416, name: 'Dalarnas län',         emoji: '🐴' },
  { code: '21', id: 417, name: 'Gävleborgs län',       emoji: '🌊' },
  { code: '22', id: 418, name: 'Västernorrlands län',  emoji: '🪵' },
  { code: '23', id: 419, name: 'Jämtlands län',        emoji: '⛰️' },
  { code: '24', id: 420, name: 'Västerbottens län',    emoji: '🦌' },
  { code: '25', id: 421, name: 'Norrbottens län',      emoji: '❄️' },
];

const SE_LAN_BY_CODE = new Map(SE_LAN.map((l) => [l.code, l]));

/**
 * Attach a län id to every kommun from its SCB code.
 *
 * Throws in both directions, like the Latvian loader: a kommun whose code has no
 * län, or a län no kommun claims, means OSM and the statutory table have
 * diverged — a Swedish county reform is exactly the event this should surface
 * loudly rather than silently dropping municipalities off the Avastuskaart.
 */
export function assignSwedishRegions(municipalities) {
  const noCode = [];
  const assigned = municipalities.map((m) => {
    // OSM drops the leading zero on codes below 1000, so "180" is Stockholm's
    // 0180. Pad before slicing or every Stockholm kommun lands in län "18".
    const raw = String(m.tags?.['ref:scb'] ?? m.tags?.ref ?? '').trim();
    const code = raw.length === 3 ? `0${raw}` : raw;
    const lan = code.length === 4 ? SE_LAN_BY_CODE.get(code.slice(0, 2)) : undefined;
    if (!lan) { noCode.push(`${m.name} (ref:scb=${raw || 'missing'})`); return m; }
    return { ...m, regionId: lan.id };
  });
  if (noCode.length) {
    throw new Error(`SE: kommuner with no resolvable SCB län code: ${noCode.join(', ')}`);
  }
  const used = new Set(assigned.map((m) => m.regionId));
  const unused = SE_LAN.filter((l) => !used.has(l.id));
  if (unused.length) {
    throw new Error(`SE: SE_LAN lists län no kommun belongs to: ${unused.map((l) => l.name).join(', ')}`);
  }
  return assigned;
}

/**
 * Attach a region id to every Maltese council from its ISO 3166-2 code.
 *
 * Throws in both directions, like the Latvian and Swedish loaders: a council
 * OSM has but the table does not, or a region no council claims, means the two
 * have diverged and the Avastuskaart would quietly lose tiles.
 */
export function assignMalteseRegions(municipalities) {
  const unknown = municipalities.filter((m) => !MT_COUNCIL_REGION[m.tags?.['ISO3166-2']]);
  if (unknown.length) {
    throw new Error(
      `MT: councils with no entry in MT_COUNCIL_REGION: ${unknown.map((m) => `${m.name} (${m.tags?.['ISO3166-2'] ?? 'no ISO'})`).join(', ')}`,
    );
  }
  const assigned = municipalities.map((m) => ({ ...m, regionId: MT_COUNCIL_REGION[m.tags['ISO3166-2']] }));
  const used = new Set(assigned.map((m) => m.regionId));
  const unusedRegions = MT_REGIONS.filter((r) => !used.has(r.id));
  if (unusedRegions.length) {
    throw new Error(`MT: MT_REGIONS lists regions no council belongs to: ${unusedRegions.map((r) => r.name).join(', ')}`);
  }
  const osmIso = new Set(municipalities.map((m) => m.tags?.['ISO3166-2']));
  const stale = Object.keys(MT_COUNCIL_REGION).filter((iso) => !osmIso.has(iso));
  if (stale.length) {
    throw new Error(`MT: MT_COUNCIL_REGION lists councils OSM no longer has: ${stale.join(', ')}`);
  }
  return assigned;
}

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
  if (cc === 'SE') return SE_LAN.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, country: 'SE' }));
  if (cc === 'MT') return MT_REGIONS.map((r) => ({ id: r.id, name: r.name, emoji: r.emoji, country: 'MT' }));
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
export const SEEDABLE_COUNTRIES = ['LV', 'LT', 'FI', 'SE', 'MT'];

export function loadRegionTree(cc) {
  const municipalities = loadMunicipalities(cc);
  const withRegion =
    cc === 'LV' ? assignLatvianRegions(municipalities)           // statutory table, no OSM level 1
    : cc === 'SE' ? assignSwedishRegions(municipalities)         // statutory SCB code, exact
    : cc === 'MT' ? assignMalteseRegions(municipalities)         // statutory table keyed by ISO 3166-2
    : assignOsmLevel1(cc, municipalities, OSM_LEVEL1[cc].ids);   // LT, FI: geometry decides
  return { municipalities: withRegion, level1: level1Rows(cc, withRegion) };
}
