import { describe, expect, it } from "vitest";
import { clusterIntoZones, type ZonePoint } from "../cluster";

describe("clusterIntoZones", () => {
  it("separates well-separated groups of points into their own zone", () => {
    const group = (label: string, dLat: number, dLng: number): ZonePoint[] =>
      Array.from({ length: 5 }, (_, i) => ({
        id: `${label}${i}`,
        lat: 36.0 + dLat + i * 0.001,
        lng: 127.0 + dLng + i * 0.001,
      }));

    const points = [...group("north", 0.05, 0), ...group("east", 0, 0.05), ...group("south", -0.05, 0)];

    const zones = clusterIntoZones(points, 3);
    expect(zones).toHaveLength(3);

    for (const zone of zones) {
      const labels = new Set(zone.map((p) => p.id.replace(/\d+$/, "")));
      expect(labels.size).toBe(1);
    }

    const allAssigned = zones.flatMap((z) => z.map((p) => p.id));
    expect(new Set(allAssigned).size).toBe(15);
  });

  it("never produces more zones than requested or more than there are points", () => {
    const points: ZonePoint[] = Array.from({ length: 2 }, (_, i) => ({ id: `p${i}`, lat: 36 + i, lng: 127 }));

    expect(clusterIntoZones(points, 5)).toHaveLength(2);
    expect(clusterIntoZones(points, 1)).toHaveLength(1);
    expect(clusterIntoZones([], 3)).toHaveLength(0);
  });

  it("assigns every point to exactly one zone", () => {
    const points: ZonePoint[] = Array.from({ length: 17 }, (_, i) => ({
      id: `p${i}`,
      lat: 36.0 + Math.sin(i) * 0.03,
      lng: 127.0 + Math.cos(i) * 0.03,
    }));

    const zones = clusterIntoZones(points, 4);
    const allIds = zones.flatMap((z) => z.map((p) => p.id));
    expect(new Set(allIds).size).toBe(17);
    expect(allIds).toHaveLength(17);
  });

  // Two lines of 8 points each, one weighted 100 (a slow work type) and one
  // weighted 10 (a quick one), a modest ~130m gap apart. Pure geographic
  // k-means would cleanly separate them into an 800-weight zone and an
  // 80-weight zone -- an even split by *count* that's wildly uneven by
  // *workload*, exactly the "14 필지 vs 2 필지" shape reported in practice.
  function weightedLines(gap: number): ZonePoint[] {
    const step = 0.001;
    const points: ZonePoint[] = [];
    for (let i = 0; i < 8; i++) {
      points.push({ id: `H${i}`, lat: 36.0, lng: 127.0 + i * step, weight: 100 });
    }
    const lStart = 7 * step + gap;
    for (let i = 0; i < 8; i++) {
      points.push({ id: `L${i}`, lat: 36.0, lng: 127.0 + lStart + i * step, weight: 10 });
    }
    return points;
  }

  it("sheds load from an overloaded zone onto a nearby lighter one instead of leaving a lopsided split", () => {
    const zones = clusterIntoZones(weightedLines(0.0015), 2);
    expect(zones).toHaveLength(2);

    const weights = zones.map((z) => z.reduce((sum, p) => sum + (p.weight ?? 1), 0)).sort((a, b) => a - b);
    // Unbalanced would be [80, 800]; some weight should have moved across.
    expect(weights[1]).toBeLessThan(800);
    expect(weights[0]).toBeGreaterThan(80);
  });

  it("leaves zones imbalanced when the only fix would mean a meaningfully longer trip", () => {
    const zones = clusterIntoZones(weightedLines(0.01), 2);
    expect(zones).toHaveLength(2);

    const weights = zones.map((z) => z.reduce((sum, p) => sum + (p.weight ?? 1), 0)).sort((a, b) => a - b);
    expect(weights).toEqual([80, 800]);
  });
});
