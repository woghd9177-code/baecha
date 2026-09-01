import { geometryAreaSqm } from "@/lib/geo/polygonArea";

export interface CadastralGeometry {
  type: string;
  coordinates: unknown;
}

export interface CadastralParcel {
  pnu: string;
  address: string;
  areaSqm: number;
  geometry: CadastralGeometry;
}

// VWorld's Data API validates the caller's domain via the Referer header
// (not just a `domain` query param), which a server-to-server request has to
// set explicitly — without it every request fails with a generic
// "INCORRECT_KEY" error even for a perfectly valid, domain-registered key.
// Set VWORLD_REFERER to whatever domain you registered for this key in the
// VWorld console (defaults to localhost for local dev).
const VWORLD_REFERER = process.env.VWORLD_REFERER || "http://localhost";

function parseFeature(feature: {
  geometry: CadastralGeometry;
  properties?: { pnu?: string; addr?: string };
}): CadastralParcel {
  const geometry = feature.geometry;
  return {
    pnu: feature.properties?.pnu ?? "",
    address: feature.properties?.addr ?? "",
    areaSqm: geometryAreaSqm(geometry),
    geometry,
  };
}

async function queryCadastral(geomFilter: string, size: number) {
  const apiKey = process.env.VWORLD_API_KEY;
  if (!apiKey) {
    throw new Error("VWORLD_API_KEY is not set");
  }

  const url = new URL("https://api.vworld.kr/req/data");
  url.searchParams.set("service", "data");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("data", "LP_PA_CBND_BUBUN");
  url.searchParams.set("geomFilter", geomFilter);
  url.searchParams.set("geometry", "true");
  url.searchParams.set("crs", "EPSG:4326");
  url.searchParams.set("format", "json");
  url.searchParams.set("size", String(size));
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { headers: { Referer: VWORLD_REFERER } });
  if (!res.ok) {
    throw new Error(`VWorld cadastral request failed with status ${res.status}`);
  }

  const data = await res.json();
  if (data?.response?.status === "NOT_FOUND") return [];
  if (data?.response?.status !== "OK") {
    const message = data?.response?.error?.text ?? data?.response?.status ?? "알 수 없는 오류";
    throw new Error(`VWorld cadastral request failed: ${message}`);
  }

  return data.response?.result?.featureCollection?.features ?? [];
}

// TODO: LP_PA_CBND_BUBUN (연속지적도) doesn't include a declared land area
// attribute — area here is computed from the returned polygon geometry
// (src/lib/geo/polygonArea.ts) rather than read from VWorld. Revisit if a
// dataset with an authoritative 면적 field is preferred instead.
export async function lookupParcelAtPoint(lat: number, lng: number): Promise<CadastralParcel | null> {
  const features = await queryCadastral(`POINT(${lng} ${lat})`, 1);
  const feature = features[0];
  return feature ? parseFeature(feature) : null;
}

// Max parcels returned per viewport fetch. This is a display cap, not a
// correctness guarantee: a bbox with more parcels than this just silently
// shows a partial set rather than erroring.
const MAX_BBOX_PARCELS = 300;

// VWorld's Data API hard-rejects a BOX/POLYGON geomFilter over 10km²
// (INVALID_RANGE) — confirmed by testing directly. A zoomed-out viewport
// (e.g. zoom 13) easily covers 10x that, so the requested box is shrunk
// around its own center to stay under the limit (with a margin) rather than
// erroring out or forcing callers to zoom in further than they want. At low
// zoom this means only parcels near the center of the screen are drawn, not
// the whole visible map — panning brings more into view.
const MAX_QUERY_AREA_KM2 = 9;
const KM_PER_DEG_LAT = 111.32;

export interface LngLatBbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

function clampBboxArea(bbox: LngLatBbox): LngLatBbox {
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const centerLng = (bbox.minLng + bbox.maxLng) / 2;
  const cosLat = Math.cos((centerLat * Math.PI) / 180);
  const widthKm = (bbox.maxLng - bbox.minLng) * KM_PER_DEG_LAT * cosLat;
  const heightKm = (bbox.maxLat - bbox.minLat) * KM_PER_DEG_LAT;
  const areaKm2 = widthKm * heightKm;
  if (!(areaKm2 > MAX_QUERY_AREA_KM2)) return bbox;

  const scale = Math.sqrt(MAX_QUERY_AREA_KM2 / areaKm2);
  const halfLng = ((bbox.maxLng - bbox.minLng) * scale) / 2;
  const halfLat = ((bbox.maxLat - bbox.minLat) * scale) / 2;
  return {
    minLng: centerLng - halfLng,
    maxLng: centerLng + halfLng,
    minLat: centerLat - halfLat,
    maxLat: centerLat + halfLat,
  };
}

// Lists every cadastral parcel whose boundary intersects the given viewport,
// so the map can draw real parcel outlines *before* the user clicks one —
// clicking then just selects whichever already-drawn shape was hit, instead
// of guessing a point and asking VWorld what's there afterward.
export async function listParcelsInBbox(bbox: LngLatBbox): Promise<CadastralParcel[]> {
  const { minLng, minLat, maxLng, maxLat } = clampBboxArea(bbox);
  const features = await queryCadastral(`BOX(${minLng},${minLat},${maxLng},${maxLat})`, MAX_BBOX_PARCELS);
  return features.map(parseFeature);
}
