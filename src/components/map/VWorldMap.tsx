"use client";

import "ol/ol.css";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import OlMap from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import Polygon from "ol/geom/Polygon";
import { Circle as CircleStyle, Fill, Stroke, Style, Text } from "ol/style";
import { fromLonLat, toLonLat } from "ol/proj";
import { createEmpty, extend as extendExtent } from "ol/extent";
import type { Coordinate } from "ol/coordinate";

export interface MarkerSpec {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  color?: string;
}

export interface PolylineSpec {
  id: string;
  points: { lat: number; lng: number }[];
  color: string;
}

/** A cadastral boundary to draw, in raw GeoJSON Polygon/MultiPolygon form. */
export interface ParcelBoundarySpec {
  id: string;
  geometry: { type: string; coordinates: unknown };
}

/** A parcel boundary drawn with an explicit color/label (e.g. one per vehicle route), independent of the selection styling used while picking parcels. */
export interface ColoredAreaSpec {
  id: string;
  geometry: { type: string; coordinates: unknown };
  color: string;
  label?: string;
}

export interface LngLatBbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface VWorldMapHandle {
  setMarkers: (markers: MarkerSpec[]) => void;
  setPolylines: (polylines: PolylineSpec[]) => void;
  setParcelBoundaries: (parcels: ParcelBoundarySpec[]) => void;
  /** Restyles already-drawn boundaries so selected parcels stand out (e.g. ones already added to the job). */
  setSelectedParcelIds: (ids: Iterable<string>) => void;
  /** Draws parcel boundaries with an explicit color/label per parcel (e.g. route results) instead of the pick/select styling. */
  setColoredAreas: (areas: ColoredAreaSpec[]) => void;
  fitToMarkers: () => void;
  panTo: (lat: number, lng: number, zoom?: number) => void;
}

interface VWorldMapProps {
  center?: { lat: number; lng: number };
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  /** Fired when a click hits an already-drawn boundary from setParcelBoundaries. onMapClick is not also fired in that case. */
  onBoundaryClick?: (id: string, lat: number, lng: number) => void;
  /** Fired once on load and again whenever the visible viewport settles (pan/zoom end). */
  onViewportChange?: (bbox: LngLatBbox, zoom: number) => void;
  onReady?: () => void;
  className?: string;
}

const DEFAULT_CENTER = { lat: 36.5, lng: 127.8 }; // roughly the center of South Korea

function ringToCoords(ring: number[][]): Coordinate[] {
  return ring.map(([lng, lat]) => fromLonLat([lng, lat]));
}

// GeoJSON Polygon coordinates are already [outer, ...holes] -- exactly what
// ol/geom/Polygon expects, just with raw [lng,lat] pairs instead of
// projected map coordinates. MultiPolygon is split into one ol Polygon per
// part (all tagged with the same parcelId) rather than modeled as a single
// ol MultiPolygon, since nothing here needs them treated as one geometry.
function geometryToPolygons(geometry: { type: string; coordinates: unknown }): Polygon[] {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    return [new Polygon(rings.map(ringToCoords))];
  }
  if (geometry.type === "MultiPolygon") {
    const parts = geometry.coordinates as number[][][][];
    return parts.map((rings) => new Polygon(rings.map(ringToCoords)));
  }
  return [];
}

function lonLat(point: { lat: number; lng: number }): Coordinate {
  return fromLonLat([point.lng, point.lat]);
}

function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return hex;
  const [, r, g, b] = match;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${alpha})`;
}

const BOUNDARY_STYLE = new Style({
  fill: new Fill({ color: "rgba(21, 128, 61, 0.15)" }),
  stroke: new Stroke({ color: "#15803d", width: 1.5 }),
});
const BOUNDARY_SELECTED_STYLE = new Style({
  fill: new Fill({ color: "rgba(217, 119, 6, 0.35)" }),
  stroke: new Stroke({ color: "#b45309", width: 2.5 }),
});

// Renders VWorld's raster base map as a plain XYZ tile layer and does
// everything else (markers, routes, click handling) with plain OpenLayers —
// VWorld's own `vw.ol3` JS SDK bootstraps itself via a chain of obfuscated,
// `document.write`-based script loads that proved unreliable to embed inside
// a Next.js app. This tile-only integration only depends on one documented,
// stable REST endpoint.
export const VWorldMap = forwardRef<VWorldMapHandle, VWorldMapProps>(function VWorldMap(
  { center = DEFAULT_CENTER, zoom = 13, onMapClick, onBoundaryClick, onViewportChange, onReady, className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<OlMap | null>(null);
  const markerSourceRef = useRef<VectorSource | null>(null);
  const routeSourceRef = useRef<VectorSource | null>(null);
  const boundarySourceRef = useRef<VectorSource | null>(null);
  const boundaryLayerRef = useRef<VectorLayer | null>(null);
  const boundaryFeaturesByIdRef = useRef<Map<string, Feature[]>>(new Map());
  const selectedParcelIdsRef = useRef<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // The mount effect below registers its event listeners exactly once, so
  // callback props are read through refs kept up to date every render —
  // otherwise the listeners would forever call whatever function instance
  // happened to be passed in on the very first render.
  const onMapClickRef = useRef(onMapClick);
  const onBoundaryClickRef = useRef(onBoundaryClick);
  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onMapClickRef.current = onMapClick;
    onBoundaryClickRef.current = onBoundaryClick;
    onViewportChangeRef.current = onViewportChange;
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY;
    const baseLayer = new TileLayer({
      source: new XYZ({
        url: `https://api.vworld.kr/req/wmts/1.0.0/${apiKey}/Base/{z}/{y}/{x}.png`,
        crossOrigin: "anonymous",
      }),
    });

    const markerSource = new VectorSource();
    const routeSource = new VectorSource();
    const boundarySource = new VectorSource();
    markerSourceRef.current = markerSource;
    routeSourceRef.current = routeSource;
    boundarySourceRef.current = boundarySource;

    const boundaryLayer = new VectorLayer({ source: boundarySource, zIndex: 5 });
    boundaryLayerRef.current = boundaryLayer;

    const map = new OlMap({
      target: containerRef.current,
      layers: [
        baseLayer,
        boundaryLayer,
        new VectorLayer({ source: routeSource, zIndex: 10 }),
        new VectorLayer({ source: markerSource, zIndex: 20 }),
      ],
      view: new View({ center: lonLat(center), zoom }),
    });
    mapRef.current = map;

    map.on("click", (evt) => {
      const [lng, lat] = toLonLat(evt.coordinate);
      const hitBoundary = map.forEachFeatureAtPixel(evt.pixel, (feature) => feature, {
        layerFilter: (layer) => layer === boundaryLayerRef.current,
      });
      if (hitBoundary) {
        const parcelId = hitBoundary.get("parcelId");
        if (parcelId && onBoundaryClickRef.current) {
          onBoundaryClickRef.current(parcelId, lat, lng);
          return;
        }
      }
      onMapClickRef.current?.(lat, lng);
    });

    function emitViewport() {
      const size = map.getSize();
      if (!size || !onViewportChangeRef.current) return;
      const extent = map.getView().calculateExtent(size);
      const [minLng, minLat] = toLonLat([extent[0], extent[1]]);
      const [maxLng, maxLat] = toLonLat([extent[2], extent[3]]);
      onViewportChangeRef.current({ minLng, minLat, maxLng, maxLat }, map.getView().getZoom() ?? zoom);
    }

    map.on("moveend", emitViewport);
    map.once("rendercomplete", emitViewport);

    setMapReady(true);
    onReady?.();

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    setMarkers(markers) {
      const source = markerSourceRef.current;
      if (!source || !mapReady) return;

      source.clear();
      for (const marker of markers) {
        const feature = new Feature({ geometry: new Point(lonLat(marker)) });
        feature.setStyle(
          new Style({
            image: new CircleStyle({
              radius: 8,
              fill: new Fill({ color: marker.color ?? "#15803d" }),
              stroke: new Stroke({ color: "#ffffff", width: 2 }),
            }),
            text: marker.label
              ? new Text({
                  text: marker.label,
                  offsetY: -16,
                  fill: new Fill({ color: "#0f172a" }),
                  stroke: new Stroke({ color: "#ffffff", width: 3 }),
                })
              : undefined,
          }),
        );
        source.addFeature(feature);
      }
    },

    setPolylines(polylines) {
      const source = routeSourceRef.current;
      if (!source || !mapReady) return;

      source.clear();
      for (const polyline of polylines) {
        const coords = polyline.points.map(lonLat);
        const feature = new Feature({ geometry: new LineString(coords) });
        feature.setStyle(new Style({ stroke: new Stroke({ color: polyline.color, width: 4 }) }));
        source.addFeature(feature);
      }
    },

    setParcelBoundaries(parcels) {
      const source = boundarySourceRef.current;
      if (!source || !mapReady) return;

      source.clear();
      const byId = new Map<string, Feature[]>();
      for (const parcel of parcels) {
        const features = geometryToPolygons(parcel.geometry).map((polygon) => {
          const feature = new Feature({ geometry: polygon });
          feature.set("parcelId", parcel.id);
          feature.setStyle(selectedParcelIdsRef.current.has(parcel.id) ? BOUNDARY_SELECTED_STYLE : BOUNDARY_STYLE);
          source.addFeature(feature);
          return feature;
        });
        byId.set(parcel.id, features);
      }
      boundaryFeaturesByIdRef.current = byId;
    },

    setSelectedParcelIds(ids) {
      selectedParcelIdsRef.current = new Set(ids);
      for (const [parcelId, features] of boundaryFeaturesByIdRef.current) {
        const style = selectedParcelIdsRef.current.has(parcelId) ? BOUNDARY_SELECTED_STYLE : BOUNDARY_STYLE;
        for (const feature of features) feature.setStyle(style);
      }
    },

    setColoredAreas(areas) {
      const source = boundarySourceRef.current;
      if (!source || !mapReady) return;

      source.clear();
      for (const area of areas) {
        for (const polygon of geometryToPolygons(area.geometry)) {
          const feature = new Feature({ geometry: polygon });
          feature.set("parcelId", area.id);
          feature.setStyle(
            new Style({
              fill: new Fill({ color: hexToRgba(area.color, 0.3) }),
              stroke: new Stroke({ color: area.color, width: 2 }),
              text: area.label
                ? new Text({
                    text: area.label,
                    fill: new Fill({ color: "#ffffff" }),
                    stroke: new Stroke({ color: area.color, width: 3 }),
                  })
                : undefined,
            }),
          );
          source.addFeature(feature);
        }
      }
    },

    fitToMarkers() {
      const map = mapRef.current;
      if (!map) return;
      const combined = createEmpty();
      let hasContent = false;
      for (const source of [markerSourceRef.current, boundarySourceRef.current]) {
        const extent = source && source.getFeatures().length > 0 ? source.getExtent() : null;
        if (extent) {
          extendExtent(combined, extent);
          hasContent = true;
        }
      }
      if (!hasContent) return;
      map.getView().fit(combined, { padding: [40, 40, 40, 40], maxZoom: 17 });
    },

    panTo(lat, lng, zoomLevel) {
      const map = mapRef.current;
      if (!map) return;
      const view = map.getView();
      view.animate({ center: lonLat({ lat, lng }), zoom: zoomLevel ?? Math.max(view.getZoom() ?? 13, 15) });
    },
  }));

  function handleLocate() {
    if (!navigator.geolocation) {
      setLocateError("이 브라우저에서는 위치 확인을 지원하지 않습니다");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        mapRef.current?.getView().animate({ center: lonLat({ lat: latitude, lng: longitude }), zoom: 16 });
        setLocating(false);
      },
      () => {
        setLocateError("위치 정보를 가져오지 못했습니다. 위치 권한을 확인해주세요.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <>
      <div className="relative">
        <div ref={containerRef} className={className ?? "h-[28rem] w-full rounded-lg border border-slate-200"} />
        <button
          type="button"
          onClick={handleLocate}
          disabled={locating}
          className="absolute right-2 top-2 z-10 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          {locating ? "위치 확인 중..." : "📍 내 위치"}
        </button>
      </div>
      {!process.env.NEXT_PUBLIC_VWORLD_API_KEY && (
        <p className="mt-2 text-xs text-amber-600">
          NEXT_PUBLIC_VWORLD_API_KEY가 설정되지 않아 지도가 표시되지 않습니다. .env를 확인하세요.
        </p>
      )}
      {locateError && <p className="mt-2 text-xs text-red-600">{locateError}</p>}
    </>
  );
});
