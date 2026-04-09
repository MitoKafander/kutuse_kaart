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
