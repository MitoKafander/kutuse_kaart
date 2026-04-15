import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Border-strip Latvia seed. Same upsert-by-(lat,lng) semantics as seed_stations.js
// — safe to re-run. Rolls back with: delete from stations where country='LV';
// Requires migrations/schema_phase26_stations_country.sql to have been applied.

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error('Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.');
  process.exit(1);
}

const supabase = DRY_RUN
  ? null
  : createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Bounding box covers a ~20–30 km strip south of the Estonia-Latvia border.
// West edge: Gulf of Riga coast (Ainaži). East edge: Russian tripoint area.
// South edge is conservative — 57.30°N is roughly 20 km south of the
// southernmost border point (Valga sector, ~57.52°N). The area["name"="Latvija"]
// filter ensures we only get Latvian stations even if the bbox grazes Estonia.
const BBOX = '57.30,21.50,57.90,27.50';

const query = `
[out:json][timeout:60];
area["name"="Latvija"]->.lv;
(
  node["amenity"="fuel"](${BBOX})(area.lv);
  way["amenity"="fuel"](${BBOX})(area.lv);
  relation["amenity"="fuel"](${BBOX})(area.lv);
);
out center tags;
`;

async function seed() {
  console.log(`Fetching Latvian border stations from OpenStreetMap (bbox ${BBOX})...`);
  const res = await fetch(OVERPASS_URL, { method: 'POST', body: query });
  if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
  const data = await res.json();

  const stations = data.elements
    .map((el) => {
      const lat = el.lat || el.center?.lat;
      const lon = el.lon || el.center?.lon;
      const name = el.tags?.brand || el.tags?.name || el.tags?.operator || 'Tundmatu';
      return {
        name,
        latitude: lat,
        longitude: lon,
        amenities: el.tags || {},
        country: 'LV',
      };
    })
    .filter((s) => s.latitude && s.longitude);

  console.log(`Found ${stations.length} Latvian border stations.`);

  if (stations.length === 0) {
    console.warn('No stations returned — check Overpass bbox or try again later.');
    return;
  }

  const sample = stations.slice(0, 8).map((s) => `  - ${s.name} @ ${s.latitude.toFixed(4)},${s.longitude.toFixed(4)}`).join('\n');
  console.log(`Sample:\n${sample}${stations.length > 8 ? `\n  ... and ${stations.length - 8} more` : ''}`);

  const brandCounts = stations.reduce((acc, s) => {
    acc[s.name] = (acc[s.name] || 0) + 1;
    return acc;
  }, {});
  const sortedBrands = Object.entries(brandCounts).sort((a, b) => b[1] - a[1]);
  console.log('\nBrand distribution:');
  for (const [name, count] of sortedBrands) console.log(`  ${count.toString().padStart(3)} × ${name}`);

  if (DRY_RUN) {
    console.log('\n--dry-run: skipping DB write. Re-run without the flag to actually insert.');
    return;
  }

  const { error } = await supabase
    .from('stations')
    .upsert(stations, { onConflict: 'latitude,longitude' });

  if (error) throw error;
  console.log(`Upserted ${stations.length} Latvian stations (country='LV').`);
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
