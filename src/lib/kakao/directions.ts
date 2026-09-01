export interface DrivingRoute {
  distanceMeters: number;
  durationSec: number;
  /** Road-following route geometry, as [lng, lat] pairs in travel order. */
  path: [number, number][];
}

const KAKAO_DIRECTIONS_URL = "https://apis-navi.kakaomobility.com/v1/directions";
const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 400;

interface KakaoRoad {
  vertexes?: number[];
}

interface KakaoSection {
  roads?: KakaoRoad[];
}

function extractPath(sections: KakaoSection[] | undefined): [number, number][] {
  const path: [number, number][] = [];
  for (const section of sections ?? []) {
    for (const road of section.roads ?? []) {
      const vertexes = road.vertexes ?? [];
      for (let i = 0; i + 1 < vertexes.length; i += 2) {
        path.push([vertexes[i], vertexes[i + 1]]);
      }
    }
  }
  return path;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Kakao Mobility 자동차 길찾기 (Directions) API. Coordinates are passed as
// "lng,lat" strings (longitude first). A null return means no drivable route
// was found between the two points (rather than a hard error) — callers
// should fall back to a straight-line estimate in that case.
//
// Kakao's per-key rate limit is tighter than it looks: bursts of concurrent
// requests (see /api/travel-matrix, which needs one call per parcel pair)
// can trip it well before the request count seems high, returning HTTP 400
// with `{ code: -10, msg: "API limit has been exceeded." }` — not a 429.
// Silently falling back to a straight line on that response is what caused
// only the first leg of a route to look right and everything after it to
// go straight: whichever pairs happened to lose the race against the rate
// limit lost their real path. This retries that specific error a few times
// with backoff before giving up.
export async function getDrivingRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
): Promise<DrivingRoute | null> {
  const apiKey = process.env.KAKAO_MOBILITY_API_KEY;
  if (!apiKey) {
    throw new Error("KAKAO_MOBILITY_API_KEY is not set");
  }

  const url = new URL(KAKAO_DIRECTIONS_URL);
  url.searchParams.set("origin", `${origin.lng},${origin.lat}`);
  url.searchParams.set("destination", `${destination.lng},${destination.lat}`);
  url.searchParams.set("priority", "RECOMMEND");

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(RATE_LIMIT_BASE_DELAY_MS * 2 ** (attempt - 1));
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `KakaoAK ${apiKey}` },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      if (body?.code === -10) {
        lastError = new Error("Kakao Mobility rate limit exceeded");
        continue;
      }
      throw new Error(`Kakao Mobility directions request failed with status ${res.status}`);
    }

    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route || route.result_code !== 0 || !route.summary) {
      return null;
    }

    return {
      distanceMeters: route.summary.distance,
      durationSec: route.summary.duration,
      path: extractPath(route.sections),
    };
  }

  throw lastError ?? new Error("Kakao Mobility directions request failed");
}
