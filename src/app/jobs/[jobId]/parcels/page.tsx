"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ParcelWorkspace } from "@/components/parcels/ParcelWorkspace";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";
import { formatDateRangeKorean } from "@/lib/dateRange";

export default function ParcelsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const hydrated = useStoreHydrated();
  const job = useDispatchStore((state) => state.jobs.find((j) => j.id === jobId));
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === job?.officeId));
  const workTypes = useDispatchStore((state) => state.workTypes);
  const parcelCount = useDispatchStore((state) => state.parcels.filter((p) => p.jobId === jobId).length);

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

  return (
    <div className="grid gap-6">
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">{office.name}</p>
          <h1 className="text-lg font-semibold">
            {formatDateRangeKorean(job.workDate, job.endDate ?? job.workDate)} 배차 작업 · 필지 등록
          </h1>
        </div>
        <Link href={`/jobs/${job.id}/dispatch`}>
          <Button disabled={parcelCount === 0}>다음: 작업 분류 및 배차 →</Button>
        </Link>
      </Card>

      {workTypes.length === 0 && (
        <p className="text-sm text-amber-600">
          아직 작업유형이 설정되지 않았습니다.{" "}
          <Link href="/admin/work-types" className="underline">
            작업유형 설정
          </Link>
          에서 먼저 등록해주세요.
        </p>
      )}

      <ParcelWorkspace jobId={job.id} center={{ lat: office.lat, lng: office.lng }} />
    </div>
  );
}
