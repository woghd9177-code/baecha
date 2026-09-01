"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { VWorldMap, type VWorldMapHandle } from "@/components/map/VWorldMap";
import { useDispatchStore } from "@/lib/store";
import { geocodeAddress } from "@/lib/vworld/geocode";

export function OfficeForm() {
  const router = useRouter();
  const addOffice = useDispatchStore((state) => state.addOffice);
  const mapRef = useRef<VWorldMapHandle>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGeocode() {
    if (!address.trim()) return;
    setGeocoding(true);
    setError(null);
    try {
      const data = await geocodeAddress(address);
      setCoords({ lat: data.lat, lng: data.lng });
      setAddress(data.roadAddress ?? address);
      mapRef.current?.setMarkers([{ id: "office", lat: data.lat, lng: data.lng }]);
      mapRef.current?.fitToMarkers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "지오코딩에 실패했습니다");
    } finally {
      setGeocoding(false);
    }
  }

  function handleMapClick(lat: number, lng: number) {
    setCoords({ lat, lng });
    mapRef.current?.setMarkers([{ id: "office", lat, lng }]);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError("주소 검색 또는 지도 클릭으로 좌표를 먼저 지정해주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const office = addOffice({ name, address, lat: coords.lat, lng: coords.lng });
    router.push(`/offices/${office.id}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field>
        <Label htmlFor="office-name">사무실 이름</Label>
        <Input id="office-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>

      <Field>
        <Label htmlFor="office-address">주소</Label>
        <div className="flex gap-2">
          <Input
            id="office-address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="예: 전북 김제시 요촌동 123"
          />
          <Button type="button" variant="secondary" onClick={handleGeocode} disabled={geocoding}>
            {geocoding ? "검색 중..." : "좌표 찾기"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-slate-500">또는 아래 지도를 클릭해 위치를 직접 지정할 수 있습니다.</p>
      </Field>

      <Field>
        <VWorldMap ref={mapRef} onMapClick={handleMapClick} />
      </Field>

      {coords && (
        <p className="mb-4 text-xs text-slate-500">
          선택된 좌표: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
        </p>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "등록 중..." : "사무실 등록"}
      </Button>
    </form>
  );
}
