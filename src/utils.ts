export const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

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
