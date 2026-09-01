"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { useDispatchStore } from "@/lib/store";
import { runMultiDayDispatch } from "@/lib/optimizer/multiDayDispatch";
import type { RouteEntry } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import type { LatLng } from "@/lib/optimizer/travel";
import type { RoutePathEntry } from "@/app/api/route-paths/route";
import { eachDateInRange, formatDateRangeKorean } from "@/lib/dateRange";

// How many legs to request per call to /api/route-paths. Chunked (and
// fetched sequentially) so a job with many stops can't blow past the
// serverless function's time budget in one request.
const LEG_CHUNK_SIZE = 40;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function DispatchTrigger({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [avgSpeedKmh, setAvgSpeedKmh] = useState(25);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const job = useDispatchStore((state) => state.jobs.find((j) => j.id === jobId));
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === job?.officeId));
  const parcels = useDispatchStore(useShallow((state) => state.parcels.filter((p) => p.jobId === jobId)));
  const workTypes = useDispatchStore((state) => state.workTypes);
  const vehicles = useDispatchStore(
    useShallow((state) => state.vehicles.filter((v) => v.officeId === job?.officeId && v.active)),
  );
  const setJobRoutes = useDispatchStore((state) => state.setJobRoutes);

  // Fetches a real driving route only for the legs a finalized route
  // actually uses (depot -> stop1 -> stop2 -> ...) — one call per stop, not
  // one per pair of points. Which parcel lands on which day/vehicle is
  // decided beforehand with straight-line estimates (see handleSubmit), so
  // this stays proportional to the number of stops instead of the number of
  // points squared. Any leg that fails to resolve (API error, or Kakao
  // genuinely finding no road) is simply absent from the returned map, and
  // the map renders that one segment as a straight line.
  async function fetchRealPaths(
    legs: { legId: string; from: LatLng; to: LatLng }[],
  ): Promise<{ paths: Map<string, { lat: number; lng: number }[]>; failed: boolean }> {
    const paths = new Map<string, { lat: number; lng: number }[]>();
    let failed = false;

    for (const batch of chunk(legs, LEG_CHUNK_SIZE)) {
      try {
        const res = await fetch("/api/route-paths", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legs: batch, fallbackAvgSpeedKmh: avgSpeedKmh }),
        });
        if (!res.ok) {
          failed = true;
          continue;
        }
        const { entries }: { entries: RoutePathEntry[] } = await res.json();
        for (const entry of entries) {
          if (entry.path) {
            paths.set(entry.legId, entry.path.map(([lng, lat]) => ({ lat, lng })));
          }
        }
      } catch {
        failed = true;
      }
    }

    return { paths, failed };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarning(null);

    if (!job || !office) {
      setError("작업 정보를 찾을 수 없습니다");
      return;
    }
    if (parcels.length === 0) {
      setError("등록된 필지가 없습니다");
      return;
    }
    if (vehicles.length === 0) {
      setError("배차 가능한 차량이 없습니다");
      return;
    }

    setRunning(true);
    try {
      const workTypeById = new Map(workTypes.map((wt) => [wt.id, wt]));
      const depot = { lat: office.lat, lng: office.lng };
      const dates = eachDateInRange(job.workDate, job.endDate ?? job.workDate);
      const parcelPointById = new Map(parcels.map((p) => [p.id, { lat: p.lat, lng: p.lng }]));

      // 경운은 트랙터, 방제는 드론, 수확은 콤바인처럼 작업유형마다 필요한 장비가
      // 다르므로, 전체를 한 번에 배차하지 않고 필요 장비(equipmentType) 별로
      // 필지를 나눠 그 장비를 가진 차량들끼리만 따로 배차한다. 그룹마다 실제로
      // 필요한 차량 대수는 runMultiDayDispatch가 알아서 정한다(불필요한 차량은
      // 안 씀).
      const groups = new Map<string, { id: string; lat: number; lng: number; estimatedMin: number }[]>();
      for (const p of parcels) {
        const workType = workTypeById.get(p.workTypeId);
        const equipmentType = workType?.equipmentType ?? "";
        const estimatedMin = workType ? p.areaSqm / workType.speedValue + workType.fixedOverheadMin : 0;
        const group = groups.get(equipmentType) ?? [];
        group.push({ id: p.id, lat: p.lat, lng: p.lng, estimatedMin });
        groups.set(equipmentType, group);
      }

      const allRoutes: RouteEntry[] = [];
      const allUnassignedIds: string[] = [];
      const warnings: string[] = [];
      let anyGroupFinishedEarly = false;
      let anyPathFetchFailed = false;
      let anyLegWithoutRoad = false;

      for (const [equipmentType, groupParcels] of groups) {
        const matchingVehicles = vehicles.filter((v) => v.equipmentType === equipmentType);

        if (matchingVehicles.length === 0) {
          allUnassignedIds.push(...groupParcels.map((p) => p.id));
          warnings.push(
            `${equipmentType || "미지정 장비"} 작업에 맞는 차량이 없어 ${groupParcels.length}건을 배차하지 못했습니다.`,
          );
          continue;
        }

        // Planning (which parcel on which day/vehicle, and in what order)
        // always uses straight-line estimates — fast, no API calls, no limit
        // on parcel count. Real driving routes are fetched afterward, below,
        // only for the consecutive legs the plan actually ends up using.
        const multiDayOutput = runMultiDayDispatch({
          depot,
          vehicles: matchingVehicles.map((v) => ({
            id: v.id,
            capacityMin: v.dailyCapacityMin,
            startTime: v.dayStartTime,
          })),
          parcels: groupParcels,
          dates,
          avgSpeedKmh,
        });

        allUnassignedIds.push(...multiDayOutput.unassignedParcelIds);
        if (multiDayOutput.unassignedParcelIds.length === 0 && multiDayOutput.days.length < dates.length) {
          anyGroupFinishedEarly = true;
        }

        const legs: { legId: string; from: LatLng; to: LatLng }[] = [];
        for (const { date, routes: dayRoutes } of multiDayOutput.days) {
          for (const route of dayRoutes) {
            const ordered = [...route.stops].sort((a, b) => a.sequence - b.sequence);
            ordered.forEach((stop, i) => {
              const from = i === 0 ? depot : parcelPointById.get(ordered[i - 1].parcelId);
              const to = parcelPointById.get(stop.parcelId);
              if (!from || !to) return;
              legs.push({ legId: `${date}::${route.vehicleId}::${stop.sequence}`, from, to });
            });
          }
        }

        const { paths: pathsByLegId, failed: pathFetchFailed } = await fetchRealPaths(legs);
        if (pathFetchFailed) anyPathFetchFailed = true;
        else if (legs.length > 0 && pathsByLegId.size < legs.length) anyLegWithoutRoad = true;

        for (const { date, routes: dayRoutes } of multiDayOutput.days) {
          for (const r of dayRoutes.filter((r) => r.stops.length > 0)) {
            const stopsWithPath = r.stops.map((stop) => {
              const legId = `${date}::${r.vehicleId}::${stop.sequence}`;
              return { ...stop, pathFromPrev: pathsByLegId.get(legId) };
            });
            allRoutes.push({
              id: `${jobId}-${r.vehicleId}-${date}`,
              jobId,
              vehicleId: r.vehicleId,
              date,
              totalTravelMin: r.totalTravelMin,
              totalWorkMin: r.totalWorkMin,
              totalMin: r.totalMin,
              stops: stopsWithPath,
            });
          }
        }
      }

      if (allUnassignedIds.length > 0) {
        warnings.push(
          `${dates.length}일 안에 다 배차하지 못한 필지가 ${allUnassignedIds.length}건 있습니다. 기간을 늘리거나 차량을 추가해보세요.`,
        );
      } else if (anyGroupFinishedEarly) {
        warnings.push(`${dates.length}일 중 더 적은 날짜 안에 모든 필지를 배차했습니다.`);
      }
      if (anyPathFetchFailed) {
        warnings.push("일부 구간은 실주행 경로 조회에 실패해 직선거리로 표시했습니다.");
      } else if (anyLegWithoutRoad) {
        warnings.push("일부 구간은 근처 도로를 찾지 못해 직선거리로 표시했습니다.");
      }
      if (warnings.length > 0) setWarning(warnings.join(" "));

      setJobRoutes(jobId, allRoutes, allUnassignedIds);
      router.push(`/jobs/${jobId}/results`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {job && (
        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          작업 기간: {formatDateRangeKorean(job.workDate, job.endDate ?? job.workDate)}
        </p>
      )}
      <Field>
        <Label htmlFor="avg-speed">직선거리 대체 시 평균 속도 (km/h)</Label>
        <Input
          id="avg-speed"
          type="number"
          min={1}
          value={avgSpeedKmh}
          onChange={(e) => setAvgSpeedKmh(Number(e.target.value))}
        />
        <p className="mt-1 text-xs text-slate-500">
          배차 일정은 이 속도의 직선거리 기준으로 계산하고, 결과 지도에는 카카오모빌리티 실주행 경로를
          표시합니다. 근처에 도로를 찾지 못한 구간만 직선으로 표시됩니다.
        </p>
      </Field>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {warning && <p className="mb-4 text-sm text-amber-600">{warning}</p>}
      <Button type="submit" disabled={running}>
        {running ? "배차 계산 중..." : "AI 배차 실행"}
      </Button>
    </form>
  );
}
