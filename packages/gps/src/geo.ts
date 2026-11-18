export const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (degrees: number) => (degrees * Math.PI) / 180;

export function haversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// International barometric formula; only differences matter for climbs.
export function pressureToAltitude(hPa: number, seaLevelHPa = 1013.25): number {
  return 44330 * (1 - (hPa / seaLevelHPa) ** (1 / 5.255));
}
