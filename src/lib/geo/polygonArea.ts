const EARTH_RADIUS_M = 6371000;

type Ring = [number, number][];

// Equirectangular projection centered on the ring's average latitude, then a
// planar shoelace formula. Accurate enough for parcel-scale polygons (a few
// hundred to a few thousand sqm) where earth curvature is negligible.
function ringAreaSqm(ring: Ring): number {
  if (ring.length < 3) return 0;

  const avgLatRad = (ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length) * (Math.PI / 180);
  const cosLat = Math.cos(avgLatRad);

  const projected = ring.map(([lng, lat]) => ({
    x: (lng * Math.PI) / 180 * EARTH_RADIUS_M * cosLat,
    y: (lat * Math.PI) / 180 * EARTH_RADIUS_M,
  }));

  let twiceArea = 0;
  for (let i = 0; i < projected.length; i++) {
    const p1 = projected[i];
    const p2 = projected[(i + 1) % projected.length];
    twiceArea += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(twiceArea) / 2;
}

function polygonAreaSqm(coordinates: number[][][]): number {
  const [outer, ...holes] = coordinates as unknown as Ring[];
  if (!outer) return 0;
  const holesArea = holes.reduce((sum, hole) => sum + ringAreaSqm(hole), 0);
  return ringAreaSqm(outer) - holesArea;
}

export function geometryAreaSqm(geometry: { type: string; coordinates: unknown }): number {
  if (geometry.type === "Polygon") {
    return polygonAreaSqm(geometry.coordinates as number[][][]);
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as number[][][][]).reduce(
      (sum, polygon) => sum + polygonAreaSqm(polygon),
      0,
    );
  }
  return 0;
}
