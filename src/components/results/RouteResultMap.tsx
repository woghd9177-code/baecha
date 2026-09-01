"use client";

import { useEffect, useRef, useState } from "react";
import { VWorldMap, type VWorldMapHandle } from "@/components/map/VWorldMap";

const ROUTE_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];

export interface ResultRoute {
  vehicleId: string;
  vehicleLabel: string;
  stops: {
    parcelId: string;
    lat: number;
    lng: number;
    sequence: number;
    address: string;
    pathFromPrev?: { lat: number; lng: number }[];
  }[];
}

export function RouteResultMap({
  depot,
  routes,
  unassigned,
}: {
  depot: { lat: number; lng: number };
  routes: ResultRoute[];
  unassigned: { lat: number; lng: number; address: string }[];
}) {
  const mapRef = useRef<VWorldMapHandle>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = mapRef.current;
    if (!handle || !ready) return;

    const markers = [
      { id: "depot", lat: depot.lat, lng: depot.lng, label: "사무실", color: "#0f172a" },
      ...routes.flatMap((route, routeIndex) =>
        route.stops.map((stop) => ({
          id: stop.parcelId,
          lat: stop.lat,
          lng: stop.lng,
          label: String(stop.sequence + 1),
          color: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length],
        })),
      ),
      ...unassigned.map((p, i) => ({
        id: `unassigned-${i}`,
        lat: p.lat,
        lng: p.lng,
        label: "!",
        color: "#94a3b8",
      })),
    ];

    const polylines = routes.map((route, routeIndex) => {
      const orderedStops = [...route.stops].sort((a, b) => a.sequence - b.sequence);
      const points: { lat: number; lng: number }[] = [depot];
      for (const stop of orderedStops) {
        if (stop.pathFromPrev && stop.pathFromPrev.length > 1) {
          points.push(...stop.pathFromPrev);
        } else {
          points.push(stop);
        }
      }
      return { id: route.vehicleId, color: ROUTE_COLORS[routeIndex % ROUTE_COLORS.length], points };
    });

    handle.setMarkers(markers);
    handle.setPolylines(polylines);
    handle.fitToMarkers();
    // Re-run whenever the underlying data changes.
  }, [depot, routes, unassigned, ready]);

  return (
    <VWorldMap
      ref={mapRef}
      center={depot}
      onReady={() => setReady(true)}
      className="h-[32rem] w-full rounded-lg border border-slate-200"
    />
  );
}
