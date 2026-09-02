"use client";

import { useEffect, useRef, useState } from "react";
import { VWorldMap, type VWorldMapHandle } from "@/components/map/VWorldMap";

const ROUTE_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"];
const UNASSIGNED_COLOR = "#94a3b8";

interface ParcelGeometry {
  type: string;
  coordinates: unknown;
}

export interface ResultRoute {
  vehicleId: string;
  vehicleLabel: string;
  stops: {
    parcelId: string;
    lat: number;
    lng: number;
    sequence: number;
    address: string;
    geometry?: ParcelGeometry;
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
  unassigned: { lat: number; lng: number; address: string; geometry?: ParcelGeometry }[];
}) {
  const mapRef = useRef<VWorldMapHandle>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = mapRef.current;
    if (!handle || !ready) return;

    // A parcel's real boundary is shown as a colored area (route color, with
    // the visit order as its label) instead of a dot -- a dot at a parcel's
    // centroid doesn't convey its actual size/shape, which matters for
    // judging a route at a glance. Anything without cadastral geometry on
    // record (e.g. a geocoded-only Excel row) falls back to a plain marker
    // so it doesn't just disappear from the map.
    const areas: { id: string; geometry: ParcelGeometry; color: string; label?: string }[] = [];
    const markers = [{ id: "depot", lat: depot.lat, lng: depot.lng, label: "사무실", color: "#0f172a" }];

    routes.forEach((route, routeIndex) => {
      const color = ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
      for (const stop of route.stops) {
        const label = String(stop.sequence + 1);
        if (stop.geometry) {
          areas.push({ id: stop.parcelId, geometry: stop.geometry, color, label });
        } else {
          markers.push({ id: stop.parcelId, lat: stop.lat, lng: stop.lng, label, color });
        }
      }
    });

    unassigned.forEach((p, i) => {
      if (p.geometry) {
        areas.push({ id: `unassigned-${i}`, geometry: p.geometry, color: UNASSIGNED_COLOR, label: "!" });
      } else {
        markers.push({ id: `unassigned-${i}`, lat: p.lat, lng: p.lng, label: "!", color: UNASSIGNED_COLOR });
      }
    });

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
    handle.setColoredAreas(areas);
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
