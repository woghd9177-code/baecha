"use client";

import { fetchJsonp } from "./jsonp";

export interface GeocodeResult {
  lat: number;
  lng: number;
  roadAddress: string;
}

interface VWorldAddressResponse {
  response?: {
    status?: string;
    result?: { point?: { x: string; y: string } };
    refined?: { text?: string };
  };
}

async function requestCoord(address: string, type: "road" | "parcel") {
  const apiKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY;
  const url = new URL("https://api.vworld.kr/req/address");
  url.searchParams.set("service", "address");
  url.searchParams.set("request", "getcoord");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("crs", "epsg:4326");
  url.searchParams.set("address", address);
  url.searchParams.set("type", type);
  url.searchParams.set("format", "json");
  url.searchParams.set("key", apiKey!);

  return fetchJsonp<VWorldAddressResponse>(url.toString());
}

// Farm parcel addresses are very often 지번(parcel) addresses rather than
// 도로명(road-name) addresses, so a road-type miss falls back to a parcel-type
// lookup before giving up.
export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const apiKey = process.env.NEXT_PUBLIC_VWORLD_API_KEY;
  if (!apiKey) {
    throw new Error("NEXT_PUBLIC_VWORLD_API_KEY is not set");
  }

  let data = await requestCoord(address, "road");
  let point = data?.response?.result?.point;

  if (!point) {
    data = await requestCoord(address, "parcel");
    point = data?.response?.result?.point;
  }

  if (!point) {
    throw new Error(`No geocode match for address: ${address}`);
  }

  return {
    lat: Number(point.y),
    lng: Number(point.x),
    roadAddress: data?.response?.refined?.text ?? address,
  };
}
