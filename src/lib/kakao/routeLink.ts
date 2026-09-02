export interface KakaoRoutePoint {
  name: string;
  lat: number;
  lng: number;
}

// Kakao Map's web directions link chains points as
// /link/by/{mode}/name,lat,lng/name,lat,lng/... and documents a cap of 5
// waypoints between the start and end (so up to 7 points per link). A
// vehicle's day can easily have more stops than that, so a route longer
// than the cap is split into consecutive links -- each one picking up
// where the previous one's last stop left off, so tapping through them in
// order covers the whole route.
const MAX_POINTS_PER_LINK = 7;

export function buildKakaoRouteLinks(points: KakaoRoutePoint[]): string[] {
  if (points.length < 2) return [];

  const links: string[] = [];
  let startIndex = 0;
  while (startIndex < points.length - 1) {
    const endIndex = Math.min(startIndex + MAX_POINTS_PER_LINK - 1, points.length - 1);
    const segment = points.slice(startIndex, endIndex + 1);
    const path = segment.map((p) => `${encodeURIComponent(p.name)},${p.lat},${p.lng}`).join("/");
    links.push(`https://map.kakao.com/link/by/car/${path}`);
    startIndex = endIndex;
  }
  return links;
}
