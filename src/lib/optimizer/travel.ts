export interface LatLng {
  lat: number;
  lng: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Abstraction seam: swap this out for a real driving-time API (Kakao Mobility,
// OSRM, TMap, ...) later without touching clustering/2-opt logic.
export interface TravelTimeProvider {
  minutesBetween(a: LatLng, b: LatLng): number;
}

// Fallback estimate for pairs with no precomputed/real route: straight-line
// distance divided by a configurable average rural-road speed.
export class HaversineTravelTimeProvider implements TravelTimeProvider {
  constructor(private avgSpeedKmh: number) {}

  minutesBetween(a: LatLng, b: LatLng): number {
    const km = haversineKm(a, b);
    return (km / this.avgSpeedKmh) * 60;
  }
}

