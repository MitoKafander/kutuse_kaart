// Single source of truth for the countries Kyts covers (phase 65, Baltic
// expansion). Everything that used to be implicitly Estonian — the map's home
// view, the Avastuskaart region catalog, the boundary geojson files, the
// station-visibility toggle — reads its per-country facts from here.
//
// Adding a fourth country is: one entry here, one region seed run, one
// boundary rebuild. No component should hardcode a country code again.
//
// `stations.country` is the DB-side key and matches `code` exactly.

export const COUNTRY_CODES = ['EE', 'LV', 'LT'] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export type CountryMeta = {
  code: CountryCode;
  flag: string;
  /** i18n key for the country's own name. */
  nameKey: string;
  /** Map home view when this country is the active one. */
  center: [number, number];
  zoom: number;
  /** [minLon, minLat, maxLon, maxLat] — rough, used only for "which country is this point in". */
  bbox: [number, number, number, number];
  /**
   * Avastuskaart boundary layers. Served from /public and fetched lazily the
   * first time discovery mode opens for this country, so an Estonian user
   * never downloads Latvian or Lithuanian polygons.
   */
  boundaries: { level1: string; level2: string };
  /**
   * i18n keys for what this country calls its two admin tiers. EE says
   * maakond/vald, LV says reģions/novads, LT says apskritis/savivaldybė.
   */
  level1Key: string;
  level2Key: string;
  /**
   * Whether region names carry a translatable Estonian administrative suffix
   * ("Harju maakond" -> "Harju county"). Only EE does: Latvian and Lithuanian
   * names are genitive constructions ("Alūksnes novads") that can't be
   * suffix-swapped without mangling the stem, so they render natively.
   */
  translatableRegionSuffix: boolean;
  /** Locale offered first to a user whose device is in this country. */
  preferredLocale: string;
};

export const COUNTRIES: Record<CountryCode, CountryMeta> = {
  EE: {
    code: 'EE',
    flag: '🇪🇪',
    nameKey: 'country.EE',
    center: [58.6, 25.0],
    zoom: 7,
    bbox: [21.5, 57.5, 28.3, 59.8],
    boundaries: { level1: '/maakonnad.geojson', level2: '/parishes.geojson' },
    level1Key: 'region.level1.EE',
    level2Key: 'region.level2.EE',
    translatableRegionSuffix: true,
    preferredLocale: 'et',
  },
  LV: {
    code: 'LV',
    flag: '🇱🇻',
    nameKey: 'country.LV',
    center: [56.9, 24.6],
    zoom: 7,
    bbox: [20.9, 55.6, 28.3, 58.1],
    boundaries: { level1: '/regions_lv.geojson', level2: '/municipalities_lv.geojson' },
    level1Key: 'region.level1.LV',
    level2Key: 'region.level2.LV',
    translatableRegionSuffix: false,
    preferredLocale: 'lv',
  },
  LT: {
    code: 'LT',
    flag: '🇱🇹',
    nameKey: 'country.LT',
    center: [55.3, 23.9],
    zoom: 7,
    bbox: [20.9, 53.8, 26.9, 56.5],
    boundaries: { level1: '/regions_lt.geojson', level2: '/municipalities_lt.geojson' },
    level1Key: 'region.level1.LT',
    level2Key: 'region.level2.LT',
    translatableRegionSuffix: false,
    preferredLocale: 'lt',
  },
};

export const DEFAULT_COUNTRY: CountryCode = 'EE';

export const COUNTRY_LIST: CountryMeta[] = COUNTRY_CODES.map((c) => COUNTRIES[c]);

export function isCountryCode(v: unknown): v is CountryCode {
  return typeof v === 'string' && (COUNTRY_CODES as readonly string[]).includes(v);
}

/** Normalises anything the DB or localStorage hands us to a known country. */
export function toCountryCode(v: unknown): CountryCode {
  return isCountryCode(v) ? v : DEFAULT_COUNTRY;
}

/**
 * Which country a coordinate falls in. The three bboxes overlap along the
 * borders (a rectangle can't follow the Valga/Valka line), so a point inside
 * more than one resolves to the nearest country centre — good enough for
 * picking someone's default Avastuskaart, and never used for anything the DB
 * cares about (stations carry their own `country`).
 */
export function countryForCoords(lat: number, lon: number): CountryCode | null {
  const hits = COUNTRY_LIST.filter(
    (c) => lon >= c.bbox[0] && lon <= c.bbox[2] && lat >= c.bbox[1] && lat <= c.bbox[3],
  );
  if (hits.length === 0) return null;
  if (hits.length === 1) return hits[0].code;
  let best = hits[0];
  let bestD = Infinity;
  for (const c of hits) {
    const d = (c.center[0] - lat) ** 2 + (c.center[1] - lon) ** 2;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best.code;
}
