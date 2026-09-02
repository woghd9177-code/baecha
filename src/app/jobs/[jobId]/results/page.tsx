"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { RouteResultMap } from "@/components/results/RouteResultMap";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { formatDateKorean, formatDateRangeKorean } from "@/lib/dateRange";

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const hydrated = useStoreHydrated();
  const job = useDispatchStore((state) => state.jobs.find((j) => j.id === jobId));
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === job?.officeId));
  const allRoutes = useDispatchStore(useShallow((state) => state.routes.filter((r) => r.jobId === jobId)));
  const vehicles = useDispatchStore((state) => state.vehicles);
  const parcels = useDispatchStore(useShallow((state) => state.parcels.filter((p) => p.jobId === jobId)));
  const workTypes = useDispatchStore((state) => state.workTypes);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  if (!hydrated) {
    return <p className="text-sm text-slate-400">불러오는 중...</p>;
  }

  if (!job || !office) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          존재하지 않는 작업입니다.{" "}
          <Link href="/offices" className="text-brand-800 underline">
            사무실 목록으로
          </Link>
        </p>
      </Card>
    );
  }

  const usedDates = [...new Set(allRoutes.map((r) => r.date))].sort();
  const activeDate = selectedDate && usedDates.includes(selectedDate) ? selectedDate : usedDates[0];
  const routes = allRoutes.filter((r) => r.date === activeDate);

  const parcelById = new Map(parcels.map((p) => [p.id, p]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const workTypeById = new Map(workTypes.map((wt) => [wt.id, wt]));
  const unassignedParcels = parcels.filter((p) => p.unassigned);

  const mapRoutes = routes.map((r) => ({
    vehicleId: r.vehicleId,
    vehicleLabel: vehicleById.get(r.vehicleId)?.label ?? r.vehicleId,
    stops: r.stops.map((s) => {
      const parcel = parcelById.get(s.parcelId);
      return {
        parcelId: s.parcelId,
        lat: parcel?.lat ?? office.lat,
        lng: parcel?.lng ?? office.lng,
        sequence: s.sequence,
        address: parcel?.address ?? "",
        geometry: parcel?.geometry as { type: string; coordinates: unknown } | undefined,
        pathFromPrev: s.pathFromPrev,
      };
    }),
  }));

  return (
    <div className="grid gap-6">
      <Card>
        <p className="text-sm text-slate-500">{office.name}</p>
        <h1 className="text-lg font-semibold text-brand-900">
          {formatDateRangeKorean(job.workDate, job.endDate ?? job.workDate)} 배차 결과
        </h1>
        {usedDates.length > 0 && (
          <p className="mt-1 text-sm text-slate-500">
            요청 기간 중 <span className="font-semibold text-brand-700">{usedDates.length}일</span>만에 배차를
            마쳤습니다.
          </p>
        )}
      </Card>

      {allRoutes.length === 0 ? (
        <p className="text-sm text-slate-500">아직 배차 결과가 없습니다.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 rounded-full bg-brand-50 p-1">
            {usedDates.map((date, i) => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  date === activeDate ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-brand-700"
                }`}
              >
                {i + 1}일차 · {formatDateKorean(date)}
              </button>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RouteResultMap
                depot={{ lat: office.lat, lng: office.lng }}
                routes={mapRoutes}
                unassigned={unassignedParcels.map((p) => ({
                  lat: p.lat,
                  lng: p.lng,
                  address: p.address,
                  geometry: p.geometry as { type: string; coordinates: unknown } | undefined,
                }))}
              />
            </div>

            <div className="grid gap-4">
              {routes.map((route) => (
                <Card key={route.id}>
                  <CardTitle>
                    {vehicleById.get(route.vehicleId)?.label ?? route.vehicleId} ({route.stops.length}개 필지)
                  </CardTitle>
                  <p className="mb-3 text-xs text-slate-500">
                    이동 {Math.round(route.totalTravelMin)}분 · 작업 {Math.round(route.totalWorkMin)}분 · 합계{" "}
                    {Math.round(route.totalMin)}분
                  </p>
                  <ol className="space-y-2 text-sm">
                    {[...route.stops]
                      .sort((a, b) => a.sequence - b.sequence)
                      .map((stop) => {
                        const parcel = parcelById.get(stop.parcelId);
                        return (
                          <li key={stop.parcelId} className="border-b border-brand-50 pb-2 last:border-0">
                            <p className="font-medium">
                              {stop.sequence + 1}. {parcel?.address ?? "알 수 없는 필지"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {parcel ? (workTypeById.get(parcel.workTypeId)?.name ?? "-") : "-"} · 도착{" "}
                              {stop.arrivalTime} → 출발 {stop.departureTime} (이동{" "}
                              {Math.round(stop.travelFromPrevMin)}분)
                            </p>
                          </li>
                        );
                      })}
                  </ol>
                </Card>
              ))}

              {unassignedParcels.length > 0 && (
                <Card className="border-amber-300 bg-amber-50">
                  <CardTitle>배차되지 않은 필지 ({unassignedParcels.length}건)</CardTitle>
                  <ul className="space-y-1 text-sm">
                    {unassignedParcels.map((p) => (
                      <li key={p.id}>
                        {p.address} · {workTypeById.get(p.workTypeId)?.name ?? "-"}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-amber-700">
                    작업 기간을 늘리거나 차량을 추가한 뒤 다시 배차해보세요.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
