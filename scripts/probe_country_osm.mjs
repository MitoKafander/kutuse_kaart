// Step 0 of adding a country: which OSM admin levels actually carry its two
// Avastuskaart tiers, and how many fuel stations are there.
//
//   node scripts/probe_country_osm.mjs PL
//   node scripts/probe_country_osm.mjs PL --levels 4,6,7,8
//
// WHY THIS IS A SCRIPT. Guessing the tier is the recurring trap, and every
// country so far has been a different shape:
//
//   EE  level 7 municipalities        LV  NO level-1 in OSM at all
//   LT  level 4 + 5                   FI  level 8, NOT 5 — its level 7 covers
//                                         69 of 308, a partial cover
//   SE  level 7, and level 8 is a partial cover too (83 of 290)
//   MT  nothing above level 8 whatsoever
//   NO  level 7, with Svalbard tagged alongside real kommuner
//   DK  the textbook 4 + 7
//
// It had been retyped by hand each time, and on Poland that went wrong: the
// ad-hoc version used `expect: total != null`, which ACCEPTS ZERO. A throttled
// mirror answered 200 with an empty result, the probe reported "Poland has no
// fuel stations and no powiats", and that nearly became the basis for choosing
// a tier. The helper this calls exists precisely to rotate mirrors until a
// DECLARED sanity check passes — so the check has to be a real one, and now it
// is written down once instead of retyped.

import { overpass } from './_lib/overpass.mjs';

const args = process.argv.slice(2);
const cc = args.find((a) => /^[A-Za-z]{2}$/.test(a))?.toUpperCase();
if (!cc) {
  console.error('Usage: node scripts/probe_country_osm.mjs <ISO2> [--levels 4,6,7,8]');
  process.exit(2);
}
const levelArg = args[args.indexOf('--levels') + 1];
const LEVELS = args.includes('--levels') && levelArg
  ? levelArg.split(',').map(Number)
  : [4, 5, 6, 7, 8];

/** A count of zero is what a throttled mirror returns. Never accept it. */
const nonZero = (d) => Number(d?.elements?.[0]?.tags?.total) > 0;

const counts = {};
for (const level of LEVELS) {
  const q = `[out:json][timeout:600];
area["ISO3166-1"="${cc}"]["admin_level"="2"]->.a;
relation["boundary"="administrative"]["admin_level"="${level}"](area.a);
out count;`;
  try {
    const r = await overpass(q, { cacheKey: `_probe_${cc}_L${level}.json`, expect: nonZero });
    counts[level] = Number(r.elements[0].tags.total);
    console.log(`  admin_level=${level}: ${counts[level]} relations`);
  } catch {
    // A level that genuinely has none fails the sanity check and exhausts the
    // mirrors, which is slow but honest — "absent" and "throttled" look the
    // same over this API, so the only safe report is that we could not confirm.
    console.log(`  admin_level=${level}: no confirmed count (absent, or every mirror was busy)`);
  }
}

const fq = `[out:json][timeout:600];
area["ISO3166-1"="${cc}"]["admin_level"="2"]->.a;
(node["amenity"="fuel"](area.a);way["amenity"="fuel"](area.a););
out count;`;
let fuel = null;
try {
  const r = await overpass(fq, { cacheKey: `_probe_${cc}_fuel.json`, expect: nonZero });
  fuel = Number(r.elements[0].tags.total);
  console.log(`\n  fuel features: ${fuel}`);
} catch {
  console.log('\n  fuel features: NOT CONFIRMED — do not seed on this');
}

console.log('\nWhat to check before choosing tiers:');
console.log('  · A level with far fewer units than the country really has is a PARTIAL');
console.log('    cover, not a tier. FI level 7 gave 69 of 308; SE level 8 gave 83 of 290.');
console.log('  · No level-1 at all (LV, MT) means a statutory table instead.');
console.log('  · Level-2 wants tens of stations per unit, not two or three — divide the');
console.log('    fuel count by each candidate and see which reads as a collectable tile.');
if (fuel) {
  for (const [lvl, n] of Object.entries(counts)) {
    if (n > 1) console.log(`      level ${lvl}: ${n} units -> ${(fuel / n).toFixed(1)} stations each`);
  }
}
console.log(`  · Cache cost: ~429 B/station, 5 MiB quota, ONE country cached.`);
if (fuel) console.log(`      ${cc} ≈ ${(fuel * 429 / 1048576).toFixed(2)} MiB (${(100 * fuel * 429 / 1048576 / 5).toFixed(0)}% of quota)`);
