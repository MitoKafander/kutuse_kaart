import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config({ path: '.env' });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in .env file.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
      const name = el.tags?.brand || el.tags?.name || 'Tundmatu';
      
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
