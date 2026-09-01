import { clusterIntoZones } from "./cluster";
import { nearestNeighborRoute, twoOptImprove, type RoutePoint } from "./twoOpt";
import { HaversineTravelTimeProvider, type LatLng, type TravelTimeProvider } from "./travel";

export interface OptimizerParcel {
  id: string;
  lat: number;
  lng: number;
  estimatedMin: number;
}

export interface OptimizerVehicle {
  id: string;
  capacityMin: number;
  /** "HH:mm" */
  startTime: string;
}

export interface RouteStopResult {
  parcelId: string;
  sequence: number;
  travelFromPrevMin: number;
  arrivalTime: string;
  departureTime: string;
}

export interface RouteResult {
  vehicleId: string;
  stops: RouteStopResult[];
  totalTravelMin: number;
  totalWorkMin: number;
  totalMin: number;
}

export interface DailyRoutes {
  date: string;
  routes: RouteResult[];
}

export interface MultiDayDispatchInput {
  depot: LatLng;
  vehicles: OptimizerVehicle[];
  parcels: OptimizerParcel[];
  /** Ordered candidate work dates (e.g. every day in the requested range). */
  dates: string[];
  avgSpeedKmh: number;
  travelProvider?: TravelTimeProvider;
}

export interface MultiDayDispatchOutput {
  /** Only the days actually needed — stops as soon as every parcel is assigned. */
  days: DailyRoutes[];
  unassignedParcelIds: string[];
}

function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutesToTime(totalMinutes: number): string {
  const wrapped = Math.round(totalMinutes) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function slotKey(vehicleId: string, date: string): string {
  return `${vehicleId}::${date}`;
}

// One geographic zone per vehicle, decided once for the whole job (see
// cluster.ts), then two passes:
//
// Phase 1 — each vehicle works through its own zone. The zone itself is
// first split into day-sized sub-zones (same geographic + workload balancing
// as the vehicle split, just one level down), sized to the *fewest* days its
// total workload actually needs — not one slice per available date. Walking
// a single nearest-neighbor route and cutting it into capacity-sized
// segments (the previous approach) let one lucky, tightly-packed stretch of
// the route fill a day with far more stops than it "should" have, then let
// a single long jump between sub-areas mid-route strand a later day
// half-empty, quietly forcing the job across more days than it needed and
// leaving them lopsided. Sub-clustering by workload first avoids that: each
// day gets a fair, geographically coherent share of the zone, and days
// beyond what the workload actually requires are never touched. Any point
// that still doesn't fit its assigned day (the workload estimate is
// travel-time-free, so it's a lower bound) spills into the next date, same
// as before — that's what keeps a zone needing more days than expected on
// the *same* vehicle across consecutive days, instead of the leftover being
// re-clustered from scratch and possibly picked up by a different vehicle.
//
// Phase 2 — global mop-up: anything phase 1 couldn't place within its own
// vehicle's date range (its zone's total workload genuinely outgrew every
// day available to it) is placed into whichever (vehicle, date) slot across
// the *whole* schedule still has room, preferring whichever such slot is
// geographically closest (least added driving), not whichever is emptiest.
// Without this phase, a parcel that doesn't fit vehicle A's remaining days
// is reported unassigned even when vehicle B has a mostly-empty day sitting
// right next to it — capacity spare on someone else's schedule shouldn't go
// to waste just because the overflow came from a different zone.
//
// "Finish early if possible" falls out of phase 1 naturally: a vehicle
// whose zone fits in one day never touches the later dates at all.
export function runMultiDayDispatch(input: MultiDayDispatchInput): MultiDayDispatchOutput {
  const { depot, vehicles, parcels, dates, avgSpeedKmh } = input;
  const travel = input.travelProvider ?? new HaversineTravelTimeProvider(avgSpeedKmh);

  if (vehicles.length === 0 || parcels.length === 0 || dates.length === 0) {
    return { days: [], unassignedParcelIds: parcels.map((p) => p.id) };
  }

  const parcelById = new Map(parcels.map((p) => [p.id, p]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const slotStops = new Map<string, RouteStopResult[]>();
  const slotLoad = new Map<string, number>();
  const slotLastPos = new Map<string, LatLng>();

  function ensureSlot(vehicleId: string, date: string): string {
    const key = slotKey(vehicleId, date);
    if (!slotStops.has(key)) {
      slotStops.set(key, []);
      slotLoad.set(key, 0);
      slotLastPos.set(key, depot);
    }
    return key;
  }

  function tryAppend(vehicleId: string, date: string, parcel: OptimizerParcel): boolean {
    const vehicle = vehicleById.get(vehicleId)!;
    const key = ensureSlot(vehicleId, date);
    const load = slotLoad.get(key)!;
    const lastPos = slotLastPos.get(key)!;
    const travelMin = travel.minutesBetween(lastPos, parcel);
    const projected = load + travelMin + parcel.estimatedMin;
    if (projected > vehicle.capacityMin) return false;

    const startMinutes = parseTimeToMinutes(vehicle.startTime);
    const stops = slotStops.get(key)!;
    const arrivalElapsed = load + travelMin;
    const departureElapsed = arrivalElapsed + parcel.estimatedMin;

    stops.push({
      parcelId: parcel.id,
      sequence: stops.length,
      travelFromPrevMin: travelMin,
      arrivalTime: formatMinutesToTime(startMinutes + arrivalElapsed),
      departureTime: formatMinutesToTime(startMinutes + departureElapsed),
    });
    slotLoad.set(key, projected);
    slotLastPos.set(key, parcel);
    return true;
  }

  // Phase 1 only zones/routes across as many vehicles as the total workload
  // actually needs, instead of always splitting into vehicles.length shares.
  // Requesting 2 vehicles for a job that comfortably fits in one used to
  // still cut the parcels into two geographic halves and send both out —
  // "how many vehicles were made available" isn't the same question as "how
  // many are needed". The unused vehicles aren't dropped, though: they stay
  // in `vehicles` and remain valid targets for phase 2's overflow mop-up
  // below, in case this estimate (workload only, no travel time) undershoots.
  const totalWorkloadMin = parcels.reduce((sum, p) => sum + p.estimatedMin, 0);
  const avgCapacityPerVehicle = vehicles.reduce((sum, v) => sum + v.capacityMin, 0) / vehicles.length;
  const avgCapacityOverDateRange = avgCapacityPerVehicle * dates.length;
  const neededVehicleCount =
    avgCapacityOverDateRange > 0
      ? Math.max(1, Math.ceil(totalWorkloadMin / avgCapacityOverDateRange))
      : vehicles.length;
  const activeVehicles = vehicles.slice(0, Math.min(neededVehicleCount, vehicles.length));

  const zoneCount = Math.min(activeVehicles.length, parcels.length);
  const zones = clusterIntoZones(
    parcels.map((p) => ({ ...p, weight: p.estimatedMin > 0 ? p.estimatedMin : 1 })),
    zoneCount,
  );
  const overflow: OptimizerParcel[] = [];

  for (let v = 0; v < activeVehicles.length; v++) {
    const vehicle = activeVehicles[v];
    const zoneParcels = zones[v] ?? [];
    if (zoneParcels.length === 0) continue;

    const zoneWorkloadMin = zoneParcels.reduce((sum, p) => sum + p.estimatedMin, 0);
    const workloadOnlyDayEstimate = Math.max(1, Math.ceil(zoneWorkloadMin / vehicle.capacityMin));
    const dayCount = Math.min(workloadOnlyDayEstimate, dates.length);

    const dayZones = clusterIntoZones(
      zoneParcels.map((p) => ({ ...p, weight: p.estimatedMin > 0 ? p.estimatedMin : 1 })),
      dayCount,
    );

    let dateIndex = 0;
    for (const dayZone of dayZones) {
      if (dayZone.length === 0) continue;

      const nn = nearestNeighborRoute(depot, dayZone, travel);
      const ordered = twoOptImprove(depot, nn, travel) as (RoutePoint & { id: string })[];

      for (const point of ordered) {
        const parcel = parcelById.get(point.id)!;

        while (dateIndex < dates.length && !tryAppend(vehicle.id, dates[dateIndex], parcel)) {
          dateIndex++;
        }

        if (dateIndex >= dates.length) {
          overflow.push(parcel);
        }
      }

      dateIndex++; // next day-zone starts fresh on the following date
    }
  }

  // Phase 2 — among every slot the parcel actually fits into, prefer the one
  // requiring the *least extra driving* to reach, not the one with the most
  // spare capacity. Picking by spare capacity alone routinely shipped a
  // parcel across the entire map to whichever slot happened to be emptiest,
  // even when a slot right next door had enough room too — that's what
  // produced routes that zigzagged between unrelated clusters instead of
  // just picking up one nearby straggler. Fair distribution across slots is
  // already phase 1's job (via the balanced zone/day clustering); phase 2 is
  // only a last-resort safety net, so it should optimize for a cheap detour,
  // not for evening out load further.
  const unassignedParcelIds: string[] = [];

  for (const parcel of overflow) {
    let best: { vehicleId: string; date: string; travelMin: number } | null = null;

    for (const vehicle of vehicles) {
      for (const date of dates) {
        const key = slotKey(vehicle.id, date);
        const load = slotLoad.get(key) ?? 0;
        const lastPos = slotLastPos.get(key) ?? depot;
        const travelMin = travel.minutesBetween(lastPos, parcel);
        const projected = load + travelMin + parcel.estimatedMin;

        if (projected <= vehicle.capacityMin && (!best || travelMin < best.travelMin)) {
          best = { vehicleId: vehicle.id, date, travelMin };
        }
      }
    }

    if (!best || !tryAppend(best.vehicleId, best.date, parcel)) {
      unassignedParcelIds.push(parcel.id);
    }
  }

  const days: DailyRoutes[] = dates
    .map((date) => {
      const routes: RouteResult[] = [];
      for (const vehicle of vehicles) {
        const stops = slotStops.get(slotKey(vehicle.id, date));
        if (!stops || stops.length === 0) continue;
        const totalTravelMin = stops.reduce((sum, s) => sum + s.travelFromPrevMin, 0);
        const totalWorkMin = stops.reduce(
          (sum, s) => sum + (parcelById.get(s.parcelId)?.estimatedMin ?? 0),
          0,
        );
        routes.push({ vehicleId: vehicle.id, stops, totalTravelMin, totalWorkMin, totalMin: totalTravelMin + totalWorkMin });
      }
      return { date, routes };
    })
    .filter((d) => d.routes.length > 0);

  return { days, unassignedParcelIds };
}
