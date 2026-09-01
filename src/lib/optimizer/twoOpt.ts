import type { LatLng, TravelTimeProvider } from "./travel";

export interface RoutePoint {
  id: string;
  lat: number;
  lng: number;
}

export function nearestNeighborRoute(
  depot: LatLng,
  points: RoutePoint[],
  travel: TravelTimeProvider,
): RoutePoint[] {
  const remaining = [...points];
  const route: RoutePoint[] = [];
  let current: LatLng = depot;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestMin = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const m = travel.minutesBetween(current, remaining[i]);
      if (m < nearestMin) {
        nearestMin = m;
        nearestIdx = i;
      }
    }
    const [next] = remaining.splice(nearestIdx, 1);
    route.push(next);
    current = next;
  }

  return route;
}

function pointAt(depot: LatLng, route: RoutePoint[], idx: number): LatLng {
  if (idx < 0 || idx >= route.length) return depot;
  return route[idx];
}

function swapSegment(route: RoutePoint[], i: number, j: number): RoutePoint[] {
  const head = route.slice(0, i);
  const reversedMiddle = route.slice(i, j + 1).reverse();
  const tail = route.slice(j + 1);
  return [...head, ...reversedMiddle, ...tail];
}

// Delta-based 2-opt: only the two edges touched by a candidate swap are
// re-evaluated (not the whole route), so each pass is cheap even with
// hundreds of stops. maxPasses bounds worst-case runtime inside a
// serverless function.
export function twoOptImprove(
  depot: LatLng,
  route: RoutePoint[],
  travel: TravelTimeProvider,
  maxPasses = 200,
): RoutePoint[] {
  if (route.length < 3) return route;

  let best = [...route];

  for (let pass = 0; pass < maxPasses; pass++) {
    let improved = false;

    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const a = pointAt(depot, best, i - 1);
        const b = best[i];
        const c = best[j];
        const d = pointAt(depot, best, j + 1);

        const before = travel.minutesBetween(a, b) + travel.minutesBetween(c, d);
        const after = travel.minutesBetween(a, c) + travel.minutesBetween(b, d);

        if (after < before - 1e-9) {
          best = swapSegment(best, i, j);
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}
