export const EV_FUEL_TYPES = ['EV'] as const;
export const FUEL_TYPES_ALL = ['Bensiin 95', 'Bensiin 98', 'Diisel', 'LPG', 'EV'] as const;
export const DEFAULT_FUELS = ['Bensiin 95', 'Bensiin 98', 'Diisel'] as const;

export function isEvFuel(type: string | null | undefined): boolean {
  return type === 'EV';
}

export function fuelLabel(type: string): string {
  if (type === 'EV') return 'EV';
  return type;
}

export function priceUnit(type: string): string {
  return isEvFuel(type) ? '€/kWh' : '€/L';
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

export const getStationDisplayName = (station: any) => {
  const brand = station.name;
  const city = station.amenities?.['addr:city'];
  const street = station.amenities?.['addr:street'];
  const nodeName = station.amenities?.name;

  if (city && street) return `${brand} (${city}, ${street})`;
  if (city) return `${brand} (${city})`;
  if (street) return `${brand} (${street})`;
  if (nodeName && nodeName !== brand) return `${brand} (${nodeName})`;
  return brand;
};
