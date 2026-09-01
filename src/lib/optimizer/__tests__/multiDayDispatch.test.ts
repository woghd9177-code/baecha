import { describe, expect, it } from "vitest";
import { runMultiDayDispatch } from "../multiDayDispatch";
import type { OptimizerParcel } from "../multiDayDispatch";

const depot = { lat: 36.0, lng: 127.0 };

function buildParcels(count: number): OptimizerParcel[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    lat: depot.lat + (i % 10) * 0.01,
    lng: depot.lng + Math.floor(i / 10) * 0.01,
    estimatedMin: 30,
  }));
}

describe("runMultiDayDispatch", () => {
  it("finishes early and doesn't touch later days when everything fits in one", () => {
    const output = runMultiDayDispatch({
      depot,
      vehicles: [{ id: "v1", capacityMin: 480, startTime: "08:00" }],
      parcels: buildParcels(5), // 150 min of work, comfortably under 480
      dates: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
      avgSpeedKmh: 30,
    });

    expect(output.unassignedParcelIds).toHaveLength(0);
    expect(output.days).toHaveLength(1);
    expect(output.days[0].date).toBe("2026-09-01");
  });

  it("leaves the second vehicle idle when one vehicle can comfortably finish the job", () => {
    const output = runMultiDayDispatch({
      depot,
      vehicles: [
        { id: "v1", capacityMin: 480, startTime: "08:00" },
        { id: "v2", capacityMin: 480, startTime: "08:00" },
      ],
      parcels: buildParcels(10), // 300 min of work -- one vehicle's day covers it easily
      dates: ["2026-09-01", "2026-09-02"],
      avgSpeedKmh: 30,
    });

    expect(output.unassignedParcelIds).toHaveLength(0);
    const vehiclesUsed = new Set(
      output.days.flatMap((d) => d.routes.map((r) => r.vehicleId)),
    );
    // Two vehicles were *available*, but only one was actually needed --
    // splitting a job that easily fits on one vehicle into two geographic
    // halves just because a second vehicle happened to be selected sends an
    // idle vehicle out for no reason.
    expect(vehiclesUsed.size).toBe(1);
  });

  it("doesn't spread work across more days than the workload needs, and balances what it does use", () => {
    const output = runMultiDayDispatch({
      depot,
      vehicles: [{ id: "v1", capacityMin: 480, startTime: "08:00" }],
      parcels: buildParcels(24), // 720 min of work -> only 2 days needed at 480 min/day
      dates: ["2026-09-01", "2026-09-02", "2026-09-03"], // 3 offered, only 2 should be used
      avgSpeedKmh: 30,
    });

    expect(output.unassignedParcelIds).toHaveLength(0);
    expect(output.days).toHaveLength(2);

    const stopCounts = output.days.map((d) => d.routes.reduce((sum, r) => sum + r.stops.length, 0));
    expect(Math.max(...stopCounts) - Math.min(...stopCounts)).toBeLessThanOrEqual(4);
  });

  it("spills into a second day when one day's capacity isn't enough", () => {
    const output = runMultiDayDispatch({
      depot,
      vehicles: [{ id: "v1", capacityMin: 480, startTime: "08:00" }],
      parcels: buildParcels(25), // 750 min of work > one day's 480
      dates: ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"],
      avgSpeedKmh: 30,
    });

    expect(output.unassignedParcelIds).toHaveLength(0);
    expect(output.days.length).toBeGreaterThanOrEqual(2);
    expect(output.days.length).toBeLessThan(4);

    const scheduledIds = output.days.flatMap((d) => d.routes.flatMap((r) => r.stops.map((s) => s.parcelId)));
    expect(new Set(scheduledIds).size).toBe(25);
  });

  it("reports genuinely unassigned parcels once every candidate date is exhausted", () => {
    const output = runMultiDayDispatch({
      depot,
      vehicles: [{ id: "v1", capacityMin: 480, startTime: "08:00" }],
      parcels: buildParcels(40), // 1200 min of work > 2 days x 480
      dates: ["2026-09-01", "2026-09-02"],
      avgSpeedKmh: 30,
    });

    expect(output.days).toHaveLength(2);
    expect(output.unassignedParcelIds.length).toBeGreaterThan(0);

    const scheduledIds = new Set(
      output.days.flatMap((d) => d.routes.flatMap((r) => r.stops.map((s) => s.parcelId))),
    );
    for (const id of output.unassignedParcelIds) {
      expect(scheduledIds.has(id)).toBe(false);
    }
  });

  it("keeps a zone that needs two days on the same vehicle across both, instead of mixing it with another zone's leftovers", () => {
    // Zone A: a big, tight area needing ~800 min of work — more than one
    // vehicle's 480-minute day, so it must spill into day 2.
    const zoneA: OptimizerParcel[] = Array.from({ length: 20 }, (_, i) => ({
      id: `A${i}`,
      lat: depot.lat + 0.05 + (i % 5) * 0.001,
      lng: depot.lng + Math.floor(i / 5) * 0.001,
      estimatedMin: 40,
    }));
    // Zone B: a separate area with enough work of its own (660 min, still
    // comfortably under one vehicle's 3-day budget) that the combined total
    // (1460 min) exceeds what a single vehicle's 3 days could cover (1440
    // min) -- both zones genuinely need their own vehicle, not just "a
    // vehicle happened to be available".
    const zoneB: OptimizerParcel[] = Array.from({ length: 33 }, (_, i) => ({
      id: `B${i}`,
      lat: depot.lat - 0.05 - i * 0.001,
      lng: depot.lng + 0.05 + i * 0.001,
      estimatedMin: 20,
    }));

    const output = runMultiDayDispatch({
      depot,
      vehicles: [
        { id: "v1", capacityMin: 480, startTime: "08:00" },
        { id: "v2", capacityMin: 480, startTime: "08:00" },
      ],
      parcels: [...zoneA, ...zoneB],
      dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
      avgSpeedKmh: 30,
    });

    expect(output.unassignedParcelIds).toHaveLength(0);
    expect(output.days.length).toBeGreaterThanOrEqual(2);

    // Whichever vehicle ends up on zone A should be the *only* vehicle
    // touching zone A parcels, on every day it appears — never split
    // between vehicles, and never mixed with a zone B parcel.
    const vehicleForParcel = new Map<string, string>();
    for (const day of output.days) {
      for (const route of day.routes) {
        for (const stop of route.stops) {
          vehicleForParcel.set(stop.parcelId, route.vehicleId);
        }
      }
    }

    const zoneAVehicles = new Set(zoneA.map((p) => vehicleForParcel.get(p.id)));
    const zoneBVehicles = new Set(zoneB.map((p) => vehicleForParcel.get(p.id)));
    expect(zoneAVehicles.size).toBe(1);
    expect(zoneBVehicles.size).toBe(1);
    expect([...zoneAVehicles][0]).not.toBe([...zoneBVehicles][0]);
  });

  it("uses spare capacity on another vehicle's day instead of leaving overflow unassigned", () => {
    // Zone A: big enough that its own vehicle's 3 days (3 x 480 = 1440 min)
    // can't hold all of it (40 x 40 = 1600 min) — there's a genuine ~160
    // minute surplus.
    const zoneA: OptimizerParcel[] = Array.from({ length: 40 }, (_, i) => ({
      id: `A${i}`,
      lat: depot.lat + 0.05 + (i % 8) * 0.001,
      lng: depot.lng + Math.floor(i / 8) * 0.001,
      estimatedMin: 40,
    }));
    // Zone B: tiny — its vehicle finishes almost immediately, leaving lots
    // of idle capacity across all 3 days.
    const zoneB: OptimizerParcel[] = Array.from({ length: 3 }, (_, i) => ({
      id: `B${i}`,
      lat: depot.lat - 0.05 - i * 0.001,
      lng: depot.lng + 0.05 + i * 0.001,
      estimatedMin: 20,
    }));

    const output = runMultiDayDispatch({
      depot,
      vehicles: [
        { id: "v1", capacityMin: 480, startTime: "08:00" },
        { id: "v2", capacityMin: 480, startTime: "08:00" },
      ],
      parcels: [...zoneA, ...zoneB],
      dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
      avgSpeedKmh: 30,
    });

    // Total fleet capacity (2 vehicles x 3 days x 480 = 2880 min) comfortably
    // covers total demand (1600 + 60 = 1660 min), so nothing should be
    // stranded just because it came from the bigger zone.
    expect(output.unassignedParcelIds).toHaveLength(0);

    const scheduledIds = new Set(
      output.days.flatMap((d) => d.routes.flatMap((r) => r.stops.map((s) => s.parcelId))),
    );
    expect(scheduledIds.size).toBe(43);
  });

  it("sends overflow to the nearest vehicle with room, not just the least-loaded one", () => {
    // v1's zone: right at the depot, one parcel, lots of spare capacity, and
    // very close to the straggler below.
    const nearA: OptimizerParcel[] = [{ id: "A0", lat: depot.lat, lng: depot.lng, estimatedMin: 35 }];
    // v3's zone: ~1.1km from the depot, deliberately overloaded (105 min
    // against a 100 min day) so exactly one parcel overflows.
    const nearB: OptimizerParcel[] = [
      { id: "B0", lat: depot.lat + 0.01, lng: depot.lng, estimatedMin: 35 },
      { id: "B1", lat: depot.lat + 0.0102, lng: depot.lng + 0.0002, estimatedMin: 35 },
      { id: "B2", lat: depot.lat + 0.0101, lng: depot.lng + 0.0001, estimatedMin: 35 },
    ];
    // v2's zone: ~8.5km away, a long detour from the straggler. Large enough
    // (65 min, on top of the other 140 min of work) that the 205-minute
    // total genuinely needs all three vehicles -- keeping this well under
    // 200 would make the "how many vehicles are actually needed" estimate
    // introduced alongside this test settle for two, leaving v3 unused in
    // phase 1 and changing what's being tested here.
    const far: OptimizerParcel[] = [{ id: "F0", lat: depot.lat + 0.06, lng: depot.lng + 0.06, estimatedMin: 65 }];

    const output = runMultiDayDispatch({
      depot,
      vehicles: [
        { id: "v1", capacityMin: 100, startTime: "08:00" },
        { id: "v2", capacityMin: 100, startTime: "08:00" },
        { id: "v3", capacityMin: 100, startTime: "08:00" },
      ],
      parcels: [...nearA, ...nearB, ...far],
      dates: ["2026-09-01"],
      avgSpeedKmh: 30,
    });

    expect(output.unassignedParcelIds).toHaveLength(0);

    const vehicleForParcel = new Map<string, string>();
    for (const day of output.days) {
      for (const route of day.routes) {
        for (const stop of route.stops) vehicleForParcel.set(stop.parcelId, route.vehicleId);
      }
    }

    // The straggler (B1) should join the nearby, lightly-loaded v1 zone, not
    // get shipped 8.5km out to v2 just because v2 happened to be even
    // emptier -- that's what produced routes zigzagging across the map.
    expect(vehicleForParcel.get("B1")).toBe(vehicleForParcel.get("A0"));
    expect(vehicleForParcel.get("B1")).not.toBe(vehicleForParcel.get("F0"));
  });
});
