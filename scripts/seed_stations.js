import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config({ path: '.env' });

// Seeding is a privileged operation — use the service role key (server-only,
// never prefixed with VITE_ so it can't be bundled into the client). The anon
// key is public and rate-limited; relying on it here couples the seeder to RLS
// and would fail the moment we tighten station insert policies.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env (NOT the VITE_ anon key).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

// Overpass QL to fetch gas stations in Estonia
const query = `
[out:json][timeout:25];
area["name"="Eesti"]->.searchArea;
(
  node["amenity"="fuel"](area.searchArea);
  way["amenity"="fuel"](area.searchArea);
  relation["amenity"="fuel"](area.searchArea);
);
out center;
`;

async function seedStations() {
  console.log('Fetching stations from OpenStreetMap (Estonia)...');
  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      body: query
    });

    const data = await response.json();
    const stations = data.elements.map((el) => {
      // Determine coordinates
      const lat = el.lat || (el.center && el.center.lat);
      const lon = el.lon || (el.center && el.center.lon);
      
      // Extract brand/name
      const name = el.tags?.brand || el.tags?.name || el.tags?.operator || 'Tundmatu';
      
      return {
        // We can use OSM id as our reference or just let Supabase generate UUIDs
        name: name,
        latitude: lat,
        longitude: lon,
        amenities: el.tags || {}
      };
    }).filter(s => s.latitude && s.longitude);

    console.log(`Found ${stations.length} gas stations. Inserting into Supabase...`);

    const { data: dbData, error } = await supabase
      .from('stations')
      .upsert(stations, { onConflict: 'latitude,longitude' });

    if (error) throw error;

    console.log('Successfully seeded database!');

  } catch (error) {
    console.error('Error seeding stations:', error);
  }
}

seedStations();
