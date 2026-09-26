// Single source of truth for the countries Kyts covers (phase 65, Baltic
// expansion). Everything that used to be implicitly Estonian — the map's home
// view, the Avastuskaart region catalog, the boundary geojson files, the
// station-visibility toggle — reads its per-country facts from here.
//
// Adding a fourth country is: one entry here, one region seed run, one
// boundary rebuild. No component should hardcode a country code again.
//
// `stations.country` is the DB-side key and matches `code` exactly.

export const COUNTRY_CODES = ['EE', 'LV', 'LT', 'FI'] as const;
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
  /**
   * What drivers here pay in, and what Kyts therefore SHOWS. A Swede hunting
   * cheap fuel needs "17,49 kr" — a euro figure is not the number on the sign
   * and not the number they pay. Conversion, where it exists at all, is a
   * secondary annotation for cross-border comparison and never the headline.
   *
   * Mirrors `price_bounds.currency` in the DB (phase 68), which is the authority
   * the insert trigger enforces. Keep the two in step, the same way
   * MAX_SUBMIT_KM mirrors the proximity trigger.
   */
  currency: CurrencyCode;
};

/** Currencies with a row in `price_bounds`. Adding one is a DB INSERT plus an entry here. */
export const CURRENCY_CODES = ['EUR', 'SEK'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type CurrencyMeta = {
  code: CurrencyCode;
  /**
   * Decimal places a pump quotes in. Euro fuel is priced to a tenth of a cent
   * (1.789); Swedish pumps quote öre (17,49).
   */
  decimals: number;
  /** Plausibility bounds, mirroring `price_bounds` — the client rejects early, the trigger is the authority. */
  min: number;
  max: number;
  symbol: string;
  /** Where the symbol sits: '€1.789' but '17,49 kr'. */
  symbolPosition: 'prefix' | 'suffix';
  decimalSeparator: '.' | ',';
  /**
   * The hundredth unit, used for price *movements* and loyalty discounts — a
   * fuel price change is talked about in cents, not euros. SEK's is öre, which
   * is a word rather than a sign, so it needs the space '¢' does not.
   */
  subunitSymbol: string;
  subunitSpaced: boolean;
  /**
   * Digits before the decimal separator at the pump: euro fuel is 1 (1.789),
   * Swedish is 2 (17.49). The price input auto-inserts the separator once this
   * many digits are typed — get it wrong and a Swede typing "17" gets "1,7".
   */
  integerDigits: number;
};

/**
 * Deliberately NOT Intl.NumberFormat keyed on the UI language, for two reasons.
 *
 * Intl('et', 'EUR') renders '1,789 €' while Kyts has always shown '€1.789';
 * switching every price in the app is a UX decision of its own, not something
 * enabling a second currency should smuggle in.
 *
 * And Intl keyed on the interface language gets Swedish wrong precisely where it
 * matters: there is no `sv` locale yet, so Swedes read the English UI, and
 * Intl('en', 'SEK') gives 'SEK 17.49' rather than the '17,49 kr' on the pump.
 * The currency decides its own format here, whatever language surrounds it.
 */
export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  EUR: { code: 'EUR', decimals: 3, min: 0.30, max:  4.00, symbol: '€',  symbolPosition: 'prefix', decimalSeparator: '.', subunitSymbol: '¢',   subunitSpaced: false, integerDigits: 1 },
  SEK: { code: 'SEK', decimals: 2, min: 5.00, max: 40.00, symbol: 'kr', symbolPosition: 'suffix', decimalSeparator: ',', subunitSymbol: 'öre', subunitSpaced: true,  integerDigits: 2 },
};

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (CURRENCY_CODES as readonly string[]).includes(v);
}

/** The currency a price at this station is quoted in. */
export function currencyForCountry(country: unknown): CurrencyCode {
  return COUNTRIES[toCountryCode(country)].currency;
}

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
    currency: 'EUR',
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
    currency: 'EUR',
  },
  FI: {
    code: 'FI',
    flag: '🇫🇮',
    nameKey: 'country.FI',
    center: [64.5, 26.0],
    // Finland is long: 60°N to 70°N. Zoom 5 fits it; 7 would show only the south.
    zoom: 5,
    bbox: [19.0, 59.7, 31.6, 70.1],
    boundaries: { level1: '/regions_fi.geojson', level2: '/municipalities_fi.geojson' },
    level1Key: 'region.level1.FI',
    level2Key: 'region.level2.FI',
    translatableRegionSuffix: false,
    preferredLocale: 'fi',
    currency: 'EUR',
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
    currency: 'EUR',
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
 * Which country a coordinate falls in. The bboxes overlap along the shared
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
