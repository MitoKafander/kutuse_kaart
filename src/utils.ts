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
