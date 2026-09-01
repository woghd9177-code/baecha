"use client";

import { useEffect, useRef, useState } from "react";
import { Field, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { VWorldMap, type VWorldMapHandle, type LngLatBbox } from "@/components/map/VWorldMap";
import { useDispatchStore } from "@/lib/store";
import type { ExcelRowResult } from "@/app/api/parcels/excel-import/route";
import type { CadastralParcel } from "@/lib/vworld/cadastral";
import { useShallow } from "zustand/react/shallow";

// Below this zoom level a viewport can span thousands of parcels, so
// boundaries aren't fetched until the user zooms in far enough for the
// result to be a reasonable, glance-able set.
const MIN_ZOOM_FOR_BOUNDARIES = 13;
// Below this, the visible area likely exceeds VWorld's 10km^2 query cap and
// gets clamped to a smaller box around the map center (see
// clampBboxArea in lib/vworld/cadastral.ts) -- purely a UI hint threshold,
// not the actual clamp decision, which the server makes per-request.
const PARTIAL_COVERAGE_ZOOM = 15;

export function ParcelWorkspace({ jobId, center }: { jobId: string; center?: { lat: number; lng: number } }) {
  const mapRef = useRef<VWorldMapHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const workTypes = useDispatchStore((state) => state.workTypes);
  const parcels = useDispatchStore(useShallow((state) => state.parcels.filter((p) => p.jobId === jobId)));
  const addParcel = useDispatchStore((state) => state.addParcel);
  const updateParcel = useDispatchStore((state) => state.updateParcel);
  const removeParcel = useDispatchStore((state) => state.removeParcel);

  const [tab, setTab] = useState<"excel" | "map">("excel");
  const [uploadResults, setUploadResults] = useState<ExcelRowResult[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mapWorkTypeId, setMapWorkTypeId] = useState(workTypes[0]?.id ?? "");
  const [mapError, setMapError] = useState<string | null>(null);
  const [addingParcel, setAddingParcel] = useState(false);
  const [loadingBoundaries, setLoadingBoundaries] = useState(false);
  const [zoomTooLow, setZoomTooLow] = useState(false);
  const [partialCoverage, setPartialCoverage] = useState(false);

  // Keyed by pnu, from the most recent viewport fetch -- clicking an
  // already-drawn boundary selects straight out of this cache instead of
  // making a second network round trip to re-look-up the same parcel.
  const boundaryParcelsRef = useRef<Map<string, CadastralParcel>>(new Map());
  const viewportRequestIdRef = useRef(0);

  // Recolor already-registered parcels' boundaries so a click's result is
  // immediately visible on the map, not just in the list below. Also picks
  // up boundaries that get (re)drawn later after panning back over an
  // already-selected parcel.
  useEffect(() => {
    mapRef.current?.setSelectedParcelIds(parcels.map((p) => p.pnu).filter((pnu): pnu is string => Boolean(pnu)));
  }, [parcels]);

  function resolveWorkTypeId(name?: string): string {
    if (name) {
      const match = workTypes.find((wt) => wt.name === name);
      if (match) return match.id;
    }
    return workTypes[0]?.id ?? "";
  }

  async function handleExcelSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    if (workTypes.length === 0) {
      setUploadResults([{ row: 0, address: "", status: "error", message: "먼저 작업유형을 설정해주세요" }]);
      return;
    }

    setUploading(true);
    setUploadResults(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/parcels/excel-import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "업로드에 실패했습니다");

      const results: ExcelRowResult[] = data.results;
      for (const row of results) {
        if (row.status !== "ok" || row.lat === undefined || row.lng === undefined) continue;
        addParcel({
          jobId,
          address: row.address,
          pnu: row.pnu,
          lat: row.lat,
          lng: row.lng,
          geometry: row.geometry,
          areaSqm: row.areaSqm ?? 0,
          workTypeId: resolveWorkTypeId(row.workTypeName),
          source: "EXCEL",
        });
      }
      setUploadResults(results);
    } catch (err) {
      setUploadResults([
        { row: 0, address: "", status: "error", message: err instanceof Error ? err.message : "업로드 실패" },
      ]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function addCadastralParcel(cadastral: CadastralParcel, lat: number, lng: number) {
    addParcel({
      jobId,
      address: cadastral.address || (cadastral.pnu ? `PNU ${cadastral.pnu}` : `${lat.toFixed(6)}, ${lng.toFixed(6)}`),
      pnu: cadastral.pnu,
      lat,
      lng,
      geometry: cadastral.geometry,
      areaSqm: cadastral.areaSqm ?? 0,
      workTypeId: mapWorkTypeId,
      source: "MAP",
    });
  }

  // Fallback path for a click that didn't land on an already-drawn boundary
  // (map zoomed out past MIN_ZOOM_FOR_BOUNDARIES, or the click missed every
  // polygon in the last viewport fetch) -- looks the point up directly,
  // same as before boundaries were shown at all.
  async function handleMapClick(lat: number, lng: number) {
    if (!mapWorkTypeId) {
      setMapError("먼저 작업유형을 선택해주세요");
      return;
    }
    setAddingParcel(true);
    setMapError(null);
    try {
      const res = await fetch("/api/parcels/cadastral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "필지 조회에 실패했습니다");
      addCadastralParcel(data, lat, lng);
    } catch (err) {
      setMapError(err instanceof Error ? err.message : "필지 등록에 실패했습니다");
    } finally {
      setAddingParcel(false);
    }
  }

  // The boundary was already fetched as part of the viewport listing, so
  // this is just a cache lookup -- no network round trip needed to select it.
  function handleBoundaryClick(pnu: string, lat: number, lng: number) {
    if (!mapWorkTypeId) {
      setMapError("먼저 작업유형을 선택해주세요");
      return;
    }
    const cadastral = boundaryParcelsRef.current.get(pnu);
    if (!cadastral) {
      handleMapClick(lat, lng);
      return;
    }
    setMapError(null);
    addCadastralParcel(cadastral, lat, lng);
  }

  async function handleViewportChange(bbox: LngLatBbox, zoom: number) {
    if (zoom < MIN_ZOOM_FOR_BOUNDARIES) {
      setZoomTooLow(true);
      setPartialCoverage(false);
      boundaryParcelsRef.current = new Map();
      mapRef.current?.setParcelBoundaries([]);
      return;
    }
    setZoomTooLow(false);
    setPartialCoverage(zoom < PARTIAL_COVERAGE_ZOOM);

    const requestId = ++viewportRequestIdRef.current;
    setLoadingBoundaries(true);
    try {
      const res = await fetch("/api/parcels/cadastral-bbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bbox),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "필지 경계 조회에 실패했습니다");
      if (requestId !== viewportRequestIdRef.current) return; // a newer viewport superseded this one

      const parcels: CadastralParcel[] = data.parcels;
      boundaryParcelsRef.current = new Map(parcels.map((p) => [p.pnu, p]));
      mapRef.current?.setParcelBoundaries(parcels.map((p) => ({ id: p.pnu, geometry: p.geometry })));
    } catch {
      if (requestId === viewportRequestIdRef.current) {
        boundaryParcelsRef.current = new Map();
        mapRef.current?.setParcelBoundaries([]);
      }
    } finally {
      if (requestId === viewportRequestIdRef.current) setLoadingBoundaries(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <div className="mb-4 flex gap-1 rounded-full bg-brand-50 p-1">
          <button
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${tab === "excel" ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-brand-700"}`}
            onClick={() => setTab("excel")}
          >
            엑셀 업로드
          </button>
          <button
            className={`flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${tab === "map" ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-brand-700"}`}
            onClick={() => setTab("map")}
          >
            지도에서 선택
          </button>
        </div>

        {tab === "excel" ? (
          <form onSubmit={handleExcelSubmit}>
            <Field>
              <Label htmlFor="excel-file">필지 목록 엑셀 (.xlsx)</Label>
              <input
                id="excel-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="block text-sm"
                required
              />
              <p className="mt-1 text-xs text-slate-500">
                필수 열: 주소. 선택 열: 면적(㎡), 작업유형 (없으면 기본값 사용)
              </p>
            </Field>
            <Button type="submit" disabled={uploading}>
              {uploading ? "업로드 중..." : "업로드"}
            </Button>

            {uploadResults && (
              <div className="mt-4 max-h-56 overflow-y-auto rounded-md border border-slate-200 text-sm">
                <table className="w-full">
                  <thead className="bg-brand-50 text-left text-slate-500">
                    <tr>
                      <th className="px-2 py-1">행</th>
                      <th className="px-2 py-1">주소</th>
                      <th className="px-2 py-1">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadResults.map((r, i) => (
                      <tr key={i} className="border-t border-brand-50">
                        <td className="px-2 py-1">{r.row || "-"}</td>
                        <td className="px-2 py-1">{r.address || "-"}</td>
                        <td className={`px-2 py-1 ${r.status === "ok" ? "text-brand-700" : "text-red-600"}`}>
                          {r.status === "ok" ? "성공" : r.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </form>
        ) : (
          <div>
            <Field>
              <Label htmlFor="map-work-type">등록할 작업유형</Label>
              <select
                id="map-work-type"
                value={mapWorkTypeId}
                onChange={(e) => setMapWorkTypeId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {workTypes.map((wt) => (
                  <option key={wt.id} value={wt.id}>
                    {wt.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                지도를 충분히 확대하면 필지 경계선이 표시됩니다. 원하는 필지 경계를 클릭해 등록하세요.
                {loadingBoundaries && " 경계 불러오는 중..."}
                {addingParcel && " 등록 중..."}
              </p>
              {zoomTooLow && (
                <p className="mt-1 text-xs text-amber-600">지도를 더 확대하면 필지 경계가 표시됩니다.</p>
              )}
              {!zoomTooLow && partialCoverage && (
                <p className="mt-1 text-xs text-amber-600">
                  현재 배율에서는 지도 중심 부근의 필지만 표시됩니다. 더 확대하면 화면 전체에 표시돼요.
                </p>
              )}
            </Field>
            <VWorldMap
              ref={mapRef}
              center={center}
              zoom={13}
              onMapClick={handleMapClick}
              onBoundaryClick={handleBoundaryClick}
              onViewportChange={handleViewportChange}
            />
            {mapError && <p className="mt-2 text-sm text-red-600">{mapError}</p>}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle>등록된 필지 ({parcels.length}건)</CardTitle>
        {parcels.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 필지가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-brand-100 text-left text-slate-500">
                <th className="py-2">주소</th>
                <th className="py-2">면적(㎡)</th>
                <th className="py-2">작업유형</th>
                <th className="py-2">등록방식</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {parcels.map((p) => (
                <tr key={p.id} className="border-b border-brand-50">
                  <td className="py-2">{p.address}</td>
                  <td className="py-2">{p.areaSqm.toLocaleString()}</td>
                  <td className="py-2">
                    <select
                      value={p.workTypeId}
                      onChange={(e) => updateParcel(p.id, { workTypeId: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2 py-1"
                    >
                      {workTypes.map((wt) => (
                        <option key={wt.id} value={wt.id}>
                          {wt.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 text-slate-500">{p.source === "EXCEL" ? "엑셀" : "지도"}</td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeParcel(p.id)} className="text-red-600 hover:underline">
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
