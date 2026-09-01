import { haversineKm, type LatLng } from "./travel";

export interface ZonePoint {
  id: string;
  lat: number;
  lng: number;
  /** Relative workload this point contributes, for balancing zone totals rather than just point counts. Defaults to 1. */
  weight?: number;
}

const KMEANS_MAX_ITERATIONS = 20;
const KMEANS_MAX_RESTARTS = 6;

// A zone may carry up to 15% more than its fair share of total weight
// before the balancing pass tries to shed load from it.
const OVERLOAD_RATIO = 1.15;
// A point only moves to balance load if the alternate zone's centroid isn't
// more than 60% farther away than the zone it's already in — this is what
// keeps a genuinely separate, distant region from being forced to donate
// parcels just to even out totals.
const MAX_REASSIGN_DISTANCE_RATIO = 1.6;
// Bounds the total number of balancing transfers so it can't loop
// indefinitely even in pathological inputs.
const MAX_BALANCE_TRANSFERS_PER_POINT = 4;

function pointWeight(p: ZonePoint): number {
  return p.weight ?? 1;
}

// Seeds k centroids by repeatedly picking the point farthest (in straight-
// line distance) from every centroid chosen so far, starting from
// `startIndex`. Farthest-point seeding spreads centroids across the actual
// data instead of clumping them together the way a plain random pick
// easily could; varying the starting point across restarts (see
// clusterIntoZones) is what lets a few different attempts land in different
// local optima so the best one can be kept.
function seedCentroids(points: ZonePoint[], k: number, startIndex: number): LatLng[] {
  const centroids: LatLng[] = [{ lat: points[startIndex].lat, lng: points[startIndex].lng }];

  while (centroids.length < k) {
    let farthestPoint = points[0];
    let farthestDist = -1;

    for (const p of points) {
      const distToNearestCentroid = Math.min(...centroids.map((c) => haversineKm(c, p)));
      if (distToNearestCentroid > farthestDist) {
        farthestDist = distToNearestCentroid;
        farthestPoint = p;
      }
    }

    centroids.push({ lat: farthestPoint.lat, lng: farthestPoint.lng });
  }

  return centroids;
}

interface KMeansRun<T> {
  groups: T[][];
  cost: number;
  centroids: LatLng[];
}

function runKMeansOnce<T extends ZonePoint>(points: T[], k: number, startIndex: number): KMeansRun<T> {
  const centroids = seedCentroids(points, k, startIndex);
  const assignment = new Array(points.length).fill(-1);
  let finalDistances = new Array(points.length).fill(0);

  for (let iter = 0; iter < KMEANS_MAX_ITERATIONS; iter++) {
    let changed = false;
    const distances = new Array(points.length).fill(0);

    for (let i = 0; i < points.length; i++) {
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const dist = haversineKm(centroids[c], points[i]);
        if (dist < bestDist) {
          bestDist = dist;
          bestCluster = c;
        }
      }
      distances[i] = bestDist;
      if (assignment[i] !== bestCluster) {
        assignment[i] = bestCluster;
        changed = true;
      }
    }
    finalDistances = distances;

    if (!changed && iter > 0) break;

    const sums = centroids.map(() => ({ lat: 0, lng: 0, count: 0 }));
    for (let i = 0; i < points.length; i++) {
      const c = assignment[i];
      sums[c].lat += points[i].lat;
      sums[c].lng += points[i].lng;
      sums[c].count += 1;
    }
    for (let c = 0; c < centroids.length; c++) {
      if (sums[c].count > 0) {
        centroids[c] = { lat: sums[c].lat / sums[c].count, lng: sums[c].lng / sums[c].count };
      }
    }
  }

  const groups: T[][] = Array.from({ length: centroids.length }, () => []);
  for (let i = 0; i < points.length; i++) {
    groups[assignment[i]].push(points[i]);
  }

  const cost = finalDistances.reduce((sum, d) => sum + d * d, 0);
  return { groups, cost, centroids };
}

// After k-means settles on geographically compact zones, plain SSE
// minimization has no notion of *how much work* each zone ends up holding —
// it's entirely possible for one zone to end up with, say, 14 parcels and
// its neighbor with 2 just because that split happened to minimize squared
// distance, even though the parcels involved are close enough that a more
// even split would barely add any travel. This nudges load from an
// overloaded zone to an under-loaded one, one point at a time, but only for
// points where the alternate zone isn't meaningfully farther than the zone
// they're already in — a zone that's genuinely far from everything else (a
// real, separate region) is left imbalanced rather than forced to donate
// parcels at a large travel cost just to even out totals.
function balanceGroups<T extends ZonePoint>(groups: T[][], centroids: LatLng[]): T[][] {
  const k = groups.length;
  if (k <= 1) return groups;

  const flatPoints: T[] = [];
  const assignment: number[] = [];
  groups.forEach((group, c) => {
    for (const p of group) {
      flatPoints.push(p);
      assignment.push(c);
    }
  });
  if (flatPoints.length === 0) return groups;

  const dist: number[][] = flatPoints.map((p) => centroids.map((c) => haversineKm(c, p)));
  const loads = centroids.map(() => 0);
  flatPoints.forEach((p, i) => {
    loads[assignment[i]] += pointWeight(p);
  });

  const totalWeight = loads.reduce((sum, l) => sum + l, 0);
  const fairShare = totalWeight / k;
  const cap = fairShare * OVERLOAD_RATIO;

  const maxTransfers = flatPoints.length * MAX_BALANCE_TRANSFERS_PER_POINT;
  for (let transfer = 0; transfer < maxTransfers; transfer++) {
    let worstOverloaded = -1;
    let worstOverload = 0;
    for (let c = 0; c < k; c++) {
      const overload = loads[c] - cap;
      if (overload > worstOverload) {
        worstOverload = overload;
        worstOverloaded = c;
      }
    }
    if (worstOverloaded === -1) break;

    let bestPointIndex = -1;
    let bestTarget = -1;
    let bestDetour = Infinity;

    for (let i = 0; i < flatPoints.length; i++) {
      if (assignment[i] !== worstOverloaded) continue;
      const currentDist = dist[i][worstOverloaded];

      for (let c = 0; c < k; c++) {
        if (c === worstOverloaded) continue;
        if (loads[c] >= fairShare) continue;
        if (dist[i][c] > currentDist * MAX_REASSIGN_DISTANCE_RATIO) continue;

        const detour = dist[i][c] - currentDist;
        if (detour < bestDetour) {
          bestDetour = detour;
          bestPointIndex = i;
          bestTarget = c;
        }
      }
    }

    // No transfer exists that doesn't require going meaningfully farther —
    // accept the remaining imbalance instead of forcing a bad detour.
    if (bestPointIndex === -1) break;

    const movedWeight = pointWeight(flatPoints[bestPointIndex]);
    loads[worstOverloaded] -= movedWeight;
    loads[bestTarget] += movedWeight;
    assignment[bestPointIndex] = bestTarget;
  }

  const balanced: T[][] = Array.from({ length: k }, () => []);
  flatPoints.forEach((p, i) => balanced[assignment[i]].push(p));
  return balanced;
}

// Straight-line k-means on point coordinates — a fast, dependency-free way
// to find real 2D geographic groups, tried from a handful of different
// starting points with the lowest-cost (total squared distance to each
// group's centroid) result kept. A single run can land in a mediocre local
// optimum — e.g. splitting one long, unevenly-dense area awkwardly instead
// of separating it cleanly from a smaller nearby area — and restarts are
// the standard, cheap way to avoid depending on getting lucky once.
//
// This deliberately knows nothing about vehicle capacity or travel time: it
// answers "what are the real geographic zones here", once, for the whole
// job. Spreading a zone across multiple vehicle-days when it doesn't fit in
// one is multiDayDispatch.ts's job, precisely so that a zone needing two
// days stays with the same vehicle across both instead of being
// re-clustered (and possibly mixed with another zone's leftovers) from
// scratch each day.
export function clusterIntoZones<T extends ZonePoint>(points: T[], zoneCount: number): T[][] {
  if (points.length === 0) return [];
  const k = Math.min(Math.max(1, zoneCount), points.length);

  const restarts = Math.min(KMEANS_MAX_RESTARTS, points.length);
  const step = Math.max(1, Math.floor(points.length / restarts));

  let best: KMeansRun<T> | null = null;
  for (let r = 0; r < restarts; r++) {
    const startIndex = (r * step) % points.length;
    const run = runKMeansOnce(points, k, startIndex);
    if (!best || run.cost < best.cost) best = run;
  }

  return balanceGroups(best!.groups, best!.centroids);
}
