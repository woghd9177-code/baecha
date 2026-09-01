"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { DispatchTrigger } from "@/components/parcels/DispatchTrigger";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { eachDateInRange, formatDateRangeKorean } from "@/lib/dateRange";

export default function DispatchPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const hydrated = useStoreHydrated();
  const job = useDispatchStore((state) => state.jobs.find((j) => j.id === jobId));
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === job?.officeId));
  const parcels = useDispatchStore(useShallow((state) => state.parcels.filter((p) => p.jobId === jobId)));
  const workTypes = useDispatchStore((state) => state.workTypes);
  const activeVehicles = useDispatchStore(
    useShallow((state) => state.vehicles.filter((v) => v.officeId === job?.officeId && v.active)),
  );
  const activeVehicleCount = activeVehicles.length;

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

  const workTypeById = new Map(workTypes.map((wt) => [wt.id, wt]));
  const byWorkType = new Map<
    string,
    { name: string; equipmentType: string; count: number; areaSqm: number; matchingVehicles: number }
  >();
  for (const parcel of parcels) {
    const workType = workTypeById.get(parcel.workTypeId);
    const name = workType?.name ?? "알 수 없음";
    const equipmentType = workType?.equipmentType ?? "";
    const matchingVehicles = activeVehicles.filter((v) => v.equipmentType === equipmentType).length;
    const entry = byWorkType.get(parcel.workTypeId) ?? { name, equipmentType, count: 0, areaSqm: 0, matchingVehicles };
    entry.count += 1;
    entry.areaSqm += parcel.areaSqm;
    byWorkType.set(parcel.workTypeId, entry);
  }
  const missingEquipment = [...byWorkType.values()].filter((entry) => entry.matchingVehicles === 0);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardTitle>작업 요약</CardTitle>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-slate-500">사무실</dt>
          <dd>{office.name}</dd>
          <dt className="text-slate-500">작업 기간</dt>
          <dd>
            {formatDateRangeKorean(job.workDate, job.endDate ?? job.workDate)} (최대{" "}
            {eachDateInRange(job.workDate, job.endDate ?? job.workDate).length}일)
          </dd>
          <dt className="text-slate-500">등록 필지 수</dt>
          <dd>{parcels.length}건</dd>
          <dt className="text-slate-500">활성 차량 수</dt>
          <dd>{activeVehicleCount}대</dd>
        </dl>

        <h3 className="mt-4 mb-2 text-sm font-semibold text-slate-700">작업유형별 분포 · 매칭 장비</h3>
        <ul className="text-sm text-slate-600">
          {[...byWorkType.values()].map((entry) => (
            <li key={entry.name} className={entry.matchingVehicles === 0 ? "text-amber-600" : undefined}>
              {entry.name} ({entry.equipmentType || "미지정 장비"}): {entry.count}건 ·{" "}
              {entry.areaSqm.toLocaleString()}㎡ · 매칭 차량 {entry.matchingVehicles}대
            </li>
          ))}
        </ul>

        {activeVehicleCount === 0 && (
          <p className="mt-4 text-sm text-amber-600">
            활성 차량이 없습니다.{" "}
            <Link href={`/offices/${job.officeId}/vehicles`} className="underline">
              차량 관리
            </Link>
            에서 등록해주세요.
          </p>
        )}
        {activeVehicleCount > 0 && missingEquipment.length > 0 && (
          <p className="mt-4 text-sm text-amber-600">
            {missingEquipment.map((e) => `${e.name}(${e.equipmentType || "미지정 장비"})`).join(", ")} 작업에 맞는
            차량이 없어 해당 필지는 배차되지 않습니다.{" "}
            <Link href={`/offices/${job.officeId}/vehicles`} className="underline">
              차량 관리
            </Link>
            에서 확인해주세요.
          </p>
        )}
      </Card>

      <Card>
        <CardTitle>AI 배차 실행</CardTitle>
        <DispatchTrigger jobId={job.id} />
      </Card>
    </div>
  );
}
