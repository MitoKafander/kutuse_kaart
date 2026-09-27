// Phase 65 step 1: pull every OSM fact the Baltic expansion needs and cache it
// under .osm-cache/. Read-only — touches no database. Safe to re-run; cached
// responses younger than 72h are reused.
//
//   node scripts/fetch_country_osm.mjs            # LV + LT
//   node scripts/fetch_country_osm.mjs LV         # one country
//   node scripts/fetch_country_osm.mjs --force    # ignore cache
//
// What it caches, per country:
//   <cc>_municipalities.json  admin_level=5 relations WITH member geometry.
//                             These are the Avastuskaart's level-2 units:
//                             LV novadi + valstspilsētas, LT savivaldybės.
//   <cc>_counties.json        admin_level=4 relations (LT only — Lithuania's
//                             10 apskritys are the level-1 tier). Latvia has
//                             no admin_level=4 in OSM; its 5 planning regions
//                             come from the static map in seed_country_regions.
//   <cc>_fuel.json            amenity=fuel nodes + ways (centre + tags).
//
// Expected magnitudes, asserted so a throttled mirror answering `{elements:[]}`
// can never be mistaken for "this country has no municipalities":
//   LV 42-43 municipalities · LT 60 municipalities + 10 counties
//   LV ~600 fuel features   · LT ~900 fuel features

import { overpass } from './_lib/overpass.mjs';
import { SEEDABLE_COUNTRIES } from './_lib/regions.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const wanted = args.filter((a) => !a.startsWith('--')).map((s) => s.toUpperCase());
const COUNTRIES = (wanted.length ? wanted : SEEDABLE_COUNTRIES);

// admin_level per country for the two Avastuskaart tiers. `level1: null` means
// the country has no OSM-mapped level-1 boundary and the seed groups its
// municipalities via a static table instead (Latvia's planning regions).
const ADMIN = {
  LV: { level1: null, level2: 5, minL2: 40, maxL2: 45, minFuel: 350 },
  LT: { level1: 4, level2: 5, minL1: 10, maxL1: 10, minL2: 58, maxL2: 62, minFuel: 500 },
  // Finland: 19 maakunnat (admin_level=4) over 308 kunnat (admin_level=8).
  // Note level 8, not 5 — Finland has no level-5 tier, and its level 7 (69
  // relations) is a partial cover, the same trap Latvia's pilsētas were.
  FI: { level1: 4, level2: 8, minL1: 18, maxL1: 20, minL2: 290, maxL2: 320, minFuel: 1500 },
  // Sweden: 290 kommuner at admin_level=7. Probed before writing this, because
  // guessing the tier is the recurring trap — level 8 has only 83 relations, a
  // partial cover exactly like Finland's level 7 was.
  //
  // `level1: null` even though Sweden DOES have admin_level=4, unlike Latvia
  // which has none. Every kommun carries `ref:scb`, the statutory SCB code whose
  // first two digits are the län code, so the grouping comes from government
  // data instead of centroid-in-polygon inference. That is exact rather than
  // geometric, and it saves fetching 21 county relations with full member
  // geometry — a query that ran 13 minutes without returning. The level-1 map
  // layer is dissolved from the kommun polygons anyway, so nothing needs it.
  SE: { level1: null, level2: 7, minL2: 288, maxL2: 292, minFuel: 1500 },
  // Malta: 68 kunsilli lokali at admin_level=8, and NOTHING above them — probed
  // levels 4, 5, 6, 7, 9 and 10 all return zero relations. So like Latvia it has
  // no OSM level-1 and needs a statutory grouping. Only ~78 fuel features in the
  // whole country, so the bounds are small by nature, not by throttling.
  MT: { level1: null, level2: 8, minL2: 66, maxL2: 70, minFuel: 50 },
  // Norway: 15 fylker at admin_level=4 (OSM returns 16 — Svalbard is tagged
  // alongside them) over ~357 kommuner at level 7. Probed: levels 5, 6 and 8
  // are all empty, so 7 is the municipal tier here even though Finland's was 8
  // and Malta's was 8 as well. `level1: null` because the kommunenummer
  // encodes the fylke, the same trick Sweden's ref:scb allows — no need to
  // fetch 16 county relations with full geometry.
  NO: { level1: null, level2: 7, minL2: 350, maxL2: 372, minFuel: 1500 },
  // Denmark: 5 regioner at admin_level=4 over 98 kommuner at level 7 — the
  // textbook case, and the first since Lithuania where fetching level-1
  // geometry is the obvious choice: five relations is cheap, where Norway's 16
  // and Sweden's 21 were not. Probed; levels 5, 6 and 8 are empty.
  DK: { level1: 4, level2: 7, minL1: 5, maxL1: 5, minL2: 96, maxL2: 100, minFuel: 1200 },
  // Poland: 16 województwa (level 4) over 380 powiaty (level 6). The first
  // THREE-tier country — gminy sit below at level 7 with 2,480 of them, which
  // would be 3.5 stations per tile against the 6-20 every other country runs.
  // Powiat is the tier that reads as a collectable area.
  //
  // Probed with scripts/probe_country_osm.mjs. An earlier hand-rolled probe
  // reported zero powiaty and zero fuel stations because its sanity check
  // accepted a count of zero from a throttled mirror — the numbers here come
  // from the rerun that rejects it.
  PL: { level1: 4, level2: 6, minL1: 16, maxL1: 16, minL2: 375, maxL2: 385, minFuel: 5000 },
};

for (const cc of COUNTRIES) {
  const spec = ADMIN[cc];
  if (!spec) throw new Error(`No admin-level spec for ${cc}`);
  console.log(`\n=== ${cc} ===`);

  console.log(` municipalities (admin_level=${spec.level2})`);
  await overpass(
    `[out:json][timeout:600];
area["ISO3166-1"="${cc}"][admin_level=2]->.c;
relation(area.c)["boundary"="administrative"]["admin_level"="${spec.level2}"];
out body geom;`,
    {
      cacheKey: `${cc}_municipalities.json`,
      force,
      expect: (j) => {
        const rels = (j.elements || []).filter((e) => e.type === 'relation');
        const withGeom = rels.filter((r) => (r.members || []).some((m) => Array.isArray(m.geometry)));
        return rels.length >= spec.minL2 && rels.length <= spec.maxL2 && withGeom.length === rels.length;
      },
    },
  );

  if (spec.level1) {
    console.log(` counties (admin_level=${spec.level1})`);
    await overpass(
      `[out:json][timeout:600];
area["ISO3166-1"="${cc}"][admin_level=2]->.c;
relation(area.c)["boundary"="administrative"]["admin_level"="${spec.level1}"];
out tags;`,
      {
        cacheKey: `${cc}_counties.json`,
        force,
        expect: (j) => {
          const rels = (j.elements || []).filter((e) => e.type === 'relation' && e.tags?.name);
          return rels.length >= spec.minL1 && rels.length <= spec.maxL1;
        },
      },
    );

    // County geometry, so a municipality is assigned to the county its centroid
    // actually falls in. `map_to_area` membership (fetched below as a
    // cross-check) reports a municipality in EVERY county whose boundary it
    // touches — Vilniaus r. and Molėtų r. each come back in two — so it can
    // rank but not decide.
    console.log(` counties with geometry`);
    await overpass(
      `[out:json][timeout:600];
area["ISO3166-1"="${cc}"][admin_level=2]->.c;
relation(area.c)["boundary"="administrative"]["admin_level"="${spec.level1}"];
out body geom;`,
      {
        cacheKey: `${cc}_counties_geom.json`,
        force,
        expect: (j) => {
          const rels = (j.elements || []).filter((e) => e.type === 'relation');
          const withGeom = rels.filter((r) => (r.members || []).some((m) => Array.isArray(m.geometry)));
          return rels.length >= spec.minL1 && withGeom.length === rels.length;
        },
      },
    );

    console.log(` county → municipality membership (cross-check)`);
    await overpass(
      `[out:json][timeout:600];
area["ISO3166-1"="${cc}"][admin_level=2]->.c;
relation(area.c)["boundary"="administrative"]["admin_level"="${spec.level1}"]->.counties;
foreach.counties->.cur(
  .cur out ids tags;
  .cur map_to_area->.a;
  relation(area.a)["boundary"="administrative"]["admin_level"="${spec.level2}"];
  out ids tags;
);`,
      {
        cacheKey: `${cc}_county_members.json`,
        force,
        expect: (j) => {
          const rels = (j.elements || []).filter((e) => e.type === 'relation');
          return rels.length >= spec.minL1 + spec.minL2;
        },
      },
    );
  }

  console.log(` fuel stations`);
  await overpass(
    `[out:json][timeout:600];
area["ISO3166-1"="${cc}"][admin_level=2]->.c;
(
  node(area.c)["amenity"="fuel"];
  way(area.c)["amenity"="fuel"];
);
out center tags;`,
    {
      cacheKey: `${cc}_fuel.json`,
      force,
      expect: (j) => {
        const els = (j.elements || []).filter((e) => e.tags?.amenity === 'fuel');
        const located = els.filter((e) => e.lat != null || e.center?.lat != null);
        return els.length >= spec.minFuel && located.length === els.length;
      },
    },
  );
}

console.log('\nDone. Cache lives in .osm-cache/ — re-runs within 72h are free.');
