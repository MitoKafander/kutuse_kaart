export const FUEL_TYPES_ALL = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG'] as const;
export const DEFAULT_FUELS = ['Bensiin 95', 'Bensiin 98', 'Diisel'] as const;

const FUEL_LABEL_KEYS: Record<string, string> = {
  'Bensiin 95': 'fuelType.bensiin95',
  'Bensiin 98': 'fuelType.bensiin98',
  'Diisel': 'fuelType.diisel',
  'LPG': 'fuelType.lpg',
};

// `t` is optional so data-layer callers (no React context) keep the canonical
// Estonian identifier. UI callers should pass a translator to render localised
// labels while the underlying string-id ('Bensiin 95' etc.) stays the DB key.
export function fuelLabel(type: string, t?: (key: string) => string): string {
  const key = FUEL_LABEL_KEYS[type];
  if (!key || !t) return type;
  const out = t(key);
  return out === key ? type : out;
}

const REGION_SUFFIXES = ['maakond', 'vald', 'linn'] as const;
type RegionSuffix = typeof REGION_SUFFIXES[number];

// Region names ship from the DB as Estonian strings — "Harju maakond",
// "Jõelähtme vald", "Narva linn". The proper-name part stays as-is in every
// locale; only the trailing administrative noun gets swapped via region.suffix.*
// keys. Falls back to the original string when no translator is supplied.
export function localizeRegionName(name: string, t?: (key: string) => string): string {
  if (!t) return name;
  const lastSpace = name.lastIndexOf(' ');
  if (lastSpace === -1) return name;
  const suffix = name.slice(lastSpace + 1) as RegionSuffix;
  if (!REGION_SUFFIXES.includes(suffix)) return name;
  const translated = t(`region.suffix.${suffix}`);
  if (translated === `region.suffix.${suffix}`) return name;
  return `${name.slice(0, lastSpace)} ${translated}`;
}

// Same swap as localizeRegionName but strips the suffix entirely — used by
// compact tiles where the type is implied by context (e.g. the maakond grid).
export function stripRegionSuffix(name: string): string {
  const lastSpace = name.lastIndexOf(' ');
  if (lastSpace === -1) return name;
  const suffix = name.slice(lastSpace + 1) as RegionSuffix;
  if (!REGION_SUFFIXES.includes(suffix)) return name;
  return name.slice(0, lastSpace);
}

export type ReporterMap = Record<string, string>;

// Reporter name for a price. userId may be null on legacy pre-auth rows;
// returns the locale's price.anonymous string in that case. The `reporterMap`
// is populated from the v_reporters view (phase 36) once on load — absent
// entries fall back to the same anonymous label, so the UI stays readable
// even if the view race-loses to the prices fetch.
export function getReporter(
  userId: string | null | undefined,
  reporterMap: ReporterMap | null | undefined,
  t: (key: string) => string
): string {
  if (!userId) return t('price.anonymous');
  const name = reporterMap?.[userId];
  return name && name.trim() ? name : t('price.anonymous');
}

export function priceUnit(_type: string): string {
  return '€/L';
}

// Shared geolocation helper. Timeout is deliberately generous (15 s) so Brave/desktop
// users have time to accept the permission prompt on second+ invocations without
// failing with a bogus "position unavailable".
export type GeolocationErrorKind = 'permission' | 'unavailable' | 'timeout' | 'unsupported';

export function getCurrentPositionAsync(options: PositionOptions = {}): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      const err: any = new Error('Geolocation not supported');
      err.kind = 'unsupported' as GeolocationErrorKind;
      reject(err);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (e) => {
        const kind: GeolocationErrorKind =
          e.code === 1 ? 'permission' :
          e.code === 3 ? 'timeout' :
          'unavailable';
        const err: any = new Error(e.message || kind);
        err.kind = kind;
        err.code = e.code;
        reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000, ...options }
    );
  });
}

export function geolocationErrorMessageKey(kind: GeolocationErrorKind): string {
  if (kind === 'permission') return 'geo.error.permission';
  if (kind === 'timeout') return 'geo.error.timeout';
  if (kind === 'unsupported') return 'geo.error.unsupported';
  return 'geo.error.unavailable';
}

export const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Price freshness constants and helpers
export const FRESH_HOURS = 5;
export const EXPIRY_HOURS = 24;

export function getEffectiveTimestamp(price: any, allVotes: any[]): Date {
  const reportedAt = new Date(price.reported_at);
  const latestUpvote = allVotes
    .filter((v: any) => v.price_id === price.id && v.vote_type === 'up')
    .reduce((latest: Date, v: any) => {
      const t = new Date(v.created_at);
      return t > latest ? t : latest;
    }, reportedAt);
  return latestUpvote;
}

export function getPriceAgeHours(price: any, allVotes: any[]): number {
  const effective = getEffectiveTimestamp(price, allVotes);
  return (Date.now() - effective.getTime()) / (1000 * 60 * 60);
}

export function isPriceExpired(price: any, allVotes: any[]): boolean {
  return getPriceAgeHours(price, allVotes) > EXPIRY_HOURS;
}

export function isPriceFresh(price: any, allVotes: any[]): boolean {
  return getPriceAgeHours(price, allVotes) <= FRESH_HOURS;
}

// Haversine distance from a point to a great-circle segment [A, B], approximated
// by projecting onto the segment in local equirectangular coordinates. Good enough
// for short road-segment distances (<100km) at Estonia latitudes.
export function pointToSegmentKm(pLat: number, pLon: number, aLat: number, aLon: number, bLat: number, bLon: number): number {
  const latToKm = 111.32;
  const lonToKm = 111.32 * Math.cos((pLat * Math.PI) / 180);
  const ax = aLon * lonToKm, ay = aLat * latToKm;
  const bx = bLon * lonToKm, by = bLat * latToKm;
  const px = pLon * lonToKm, py = pLat * latToKm;
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + t * dx, qy = ay + t * dy;
  return Math.sqrt((px - qx) ** 2 + (py - qy) ** 2);
}

// Distance from point to nearest segment in a route polyline (LatLng pairs).
export function pointToRouteKm(pLat: number, pLon: number, route: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const d = pointToSegmentKm(pLat, pLon, route[i][0], route[i][1], route[i + 1][0], route[i + 1][1]);
    if (d < best) best = d;
  }
  return best;
}

// Loyalty discounts: flat cents off per brand (e.g. { 'Alexela': 4 } = -€0.04/L)
export type LoyaltyDiscounts = Record<string, number>;

export function getNetPrice(gross: number, brand: string, discounts: LoyaltyDiscounts, apply: boolean): number {
  if (!apply) return gross;
  const centsOff = discounts[brand];
  if (!centsOff || centsOff <= 0) return gross;
  return Math.max(0, gross - centsOff / 100);
}

export function hasDiscount(brand: string, discounts: LoyaltyDiscounts, apply: boolean): boolean {
  if (!apply) return false;
  return (discounts[brand] ?? 0) > 0;
}

// Canonical Estonian fuel chains. The `match` value is a normalized substring
// (lowercase, hyphens → spaces, whitespace collapsed) and is searched anywhere
// in the station name, so "Kristiine Circle K tankla", "Kärdla Olerex",
// "Eksar-Transoil Masti tankla", "HEPA", "Jetgas", "Premium-7", and "Thori
// tanklad" all collapse to their canonical brand for filtering, loyalty
// discounts, and colour assignment.
const CHAIN_PATTERNS: { match: string; canonical: string }[] = [
  { match: 'circle k',       canonical: 'Circle K' },
  { match: 'olerex',         canonical: 'Olerex' },
  { match: 'alexela',        canonical: 'Alexela' },
  { match: 'neste',          canonical: 'Neste' },
  { match: 'terminal',       canonical: 'Terminal' },
  { match: 'krooning',       canonical: 'Krooning' },
  { match: 'jetoil',         canonical: 'Jetoil' },
  { match: 'jetgas',         canonical: 'JetGas' },
  { match: 'statoil',        canonical: 'Statoil' },
  { match: 'eesti autogaas', canonical: 'Eesti Autogaas' },
  { match: 'eksar transoil', canonical: 'Eksar Transoil' },
  { match: 'premium 7',      canonical: 'Premium 7' },
  { match: 'hepa',           canonical: 'Hepa' },
  { match: 'thor',           canonical: 'Thor' }, // matches "Thor" and "Thori"
  // Latvian chains (border-strip + future Latvia region)
  { match: 'virsi',          canonical: 'Virši-A' }, // matches "Virši", "Virši-A", "Virsi"
  { match: 'viada',          canonical: 'Viada' },
  { match: 'kool',           canonical: 'KOOL' },
  { match: 'astarte',        canonical: 'Astarte Nafta' },
  { match: 'latvijas nafta', canonical: 'Latvijas Nafta' },
  { match: 'propāna',        canonical: 'Latvijas Propāna Gāze' }, // collapses case variants
  { match: 'lateva',         canonical: 'Lateva' },
  { match: 'gotika',         canonical: 'Gotika Auto' },
];

function normalizeBrandKey(s: string): string {
  return s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getBrand(name: string | null | undefined): string {
  if (!name) return 'Tundmatu';
  const n = normalizeBrandKey(name);
  for (const { match, canonical } of CHAIN_PATTERNS) {
    if (n.includes(match)) return canonical;
  }
  return name;
}

// `unknownLabel` lets callers pass a translated "Unknown" fallback. Defaults to
// the Estonian sentinel `Tundmatu` because `getBrand` also returns that string
// as an internal key used by filters and loyalty lookups — keep the default in
// sync with that key so data-layer callers (non-UI) don't accidentally localise.
export const getStationDisplayName = (station: any, unknownLabel: string = 'Tundmatu') => {
  const rawBrand = station.name;
  const city = station.amenities?.['addr:city'];
  const street = station.amenities?.['addr:street'];
  const nodeName = station.amenities?.name;
  const operator = station.amenities?.operator;

  const isUnknownBrand = !rawBrand || rawBrand === 'Tundmatu';
  const brand = isUnknownBrand ? (nodeName || operator || unknownLabel) : rawBrand;

  if (city && street) return `${brand} (${city}, ${street})`;
  if (city) return `${brand} (${city})`;
  if (street) return `${brand} (${street})`;
  if (!isUnknownBrand && nodeName && nodeName !== brand) return `${brand} (${nodeName})`;
  return brand;
};
