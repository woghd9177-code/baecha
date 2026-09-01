import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDrivingRoute } from "@/lib/kakao/directions";
import { haversineKm } from "@/lib/optimizer/travel";
import { runWithConcurrency } from "@/lib/concurrency";

export const maxDuration = 60;

const pointSchema = z.object({ lat: z.number(), lng: z.number() });
const legSchema = z.object({ legId: z.string(), from: pointSchema, to: pointSchema });
const bodySchema = z.object({
  legs: z.array(legSchema).min(1).max(300),
  fallbackAvgSpeedKmh: z.number().positive().default(25),
});

// Kept in line with /lib/kakao/directions.ts's retry budget — see that
// file's comment for why Kakao's rate limit needs concurrency this low.
const CONCURRENCY = 4;

export interface RoutePathEntry {
  legId: string;
  durationMin: number;
  distanceKm: number;
  /** Road-following geometry as [lng, lat] pairs; omitted for straight-line fallbacks. */
  path?: [number, number][];
}

// Fetches a real driving route for each leg that actually appears in a
// finalized route (depot -> stop1 -> stop2 -> ...) — one call per stop, not
// one per pair of points. Which parcel goes on which day/vehicle is decided
// beforehand using straight-line estimates (see runMultiDayDispatch)
// specifically so this stays O(stops): the old approach fetched a full
// pairwise matrix over every point (O(points^2)), which either tripped a
// point-count cap or ran out of the serverless time budget on real jobs and
// silently fell back to straight lines for the entire route.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { legs, fallbackAvgSpeedKmh } = parsed.data;
  const entries: RoutePathEntry[] = [];

  await runWithConcurrency(legs, CONCURRENCY, async (leg) => {
    let durationMin: number;
    let distanceKm: number;
    let path: [number, number][] | undefined;

    try {
      const route = await getDrivingRoute(leg.from, leg.to);
      if (route) {
        durationMin = route.durationSec / 60;
        distanceKm = route.distanceMeters / 1000;
        path = route.path;
      } else {
        distanceKm = haversineKm(leg.from, leg.to);
        durationMin = (distanceKm / fallbackAvgSpeedKmh) * 60;
      }
    } catch {
      distanceKm = haversineKm(leg.from, leg.to);
      durationMin = (distanceKm / fallbackAvgSpeedKmh) * 60;
    }

    entries.push({ legId: leg.legId, durationMin, distanceKm, path });
  });

  return NextResponse.json({ entries });
}
