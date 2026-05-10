// Shared row-shape types for Supabase-fetched data and app-internal entities.
// Kept intentionally minimal — only the fields the rest of the app actually
// reads. Extend as new columns get consumed.

export type Station = {
  id: string;
  name: string | null;
  latitude: number;
  longitude: number;
  active?: boolean | null;
  country?: string | null;
  amenities?: Record<string, string> | null;
};

export type Price = {
  id: string;
  station_id: string;
  fuel_type: string;
  price: number;
  reported_at: string;
  user_id?: string | null;
};

export type Vote = {
  id?: string;
  price_id: string;
  user_id: string | null;
  vote_type: 'up' | 'down';
  created_at: string;
};

// Latitude/longitude pair used by geolocation flows and route planning.
export type LatLon = { lat: number; lon: number };
