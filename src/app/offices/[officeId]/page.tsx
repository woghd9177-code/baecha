"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { formatDateRangeKorean } from "@/lib/dateRange";

export default function OfficeDetailPage() {
  const { officeId } = useParams<{ officeId: string }>();
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === officeId));
  const vehicles = useDispatchStore(useShallow((state) => state.vehicles.filter((v) => v.officeId === officeId)));
  const jobs = useDispatchStore(useShallow((state) => state.jobs.filter((j) => j.officeId === officeId)));
  const removeOffice = useDispatchStore((state) => state.removeOffice);
  const removeJob = useDispatchStore((state) => state.removeJob);

  if (!hydrated) {
    return <p className="text-sm text-slate-400">불러오는 중...</p>;
  }

  if (!office) {
    return (
      <Card>
        <p className="text-sm text-slate-500">
          존재하지 않는 사무실입니다.{" "}
          <Link href="/offices" className="text-brand-800 underline">
            사무실 목록으로
          </Link>
        </p>
      </Card>
    );
  }

  function handleDeleteOffice() {
    if (!office) return;
    if (
      !window.confirm(`"${office.name}" 사무실을 삭제할까요? 등록된 차량·배차 작업·필지가 모두 함께 삭제됩니다.`)
    ) {
      return;
    }
    removeOffice(office.id);
    router.push("/offices");
  }

  function handleDeleteJob(id: string, workDate: string, endDate: string) {
    const label = formatDateRangeKorean(workDate, endDate);
    if (!window.confirm(`${label} 배차 작업을 삭제할까요? 등록된 필지·배차 결과가 함께 삭제됩니다.`)) return;
    removeJob(id);
  }

  return (
    <div className="grid gap-6">
      <Card className="flex items-start justify-between gap-4">
        <div>
          <CardTitle>{office.name}</CardTitle>
          <p className="text-sm text-slate-600">{office.address}</p>
          <p className="text-xs text-slate-400">
            좌표 {office.lat.toFixed(6)}, {office.lng.toFixed(6)}
          </p>
        </div>
        <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={handleDeleteOffice}>
          사무실 삭제
        </Button>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>차량 / 작업자</CardTitle>
            <Link href={`/offices/${office.id}/vehicles`} className="text-sm text-brand-800 hover:underline">
              관리
            </Link>
          </div>
          {vehicles.length === 0 ? (
            <p className="text-sm text-slate-500">등록된 차량이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-brand-50 text-sm">
              {vehicles.map((v) => (
                <li key={v.id} className="flex justify-between py-2">
                  <span>{v.label}</span>
                  <span className="text-slate-500">
                    {v.equipmentType || "미지정"} · {v.dayStartTime} 시작 · {v.dailyCapacityMin}분
                    {!v.active && " · 비활성"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <CardTitle>배차 작업</CardTitle>
            <Link href={`/offices/${office.id}/jobs/new`} className="text-sm text-brand-800 hover:underline">
              + 새 작업 생성
            </Link>
          </div>
          {jobs.length === 0 ? (
            <p className="text-sm text-slate-500">생성된 작업이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-brand-50 text-sm">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-2 py-2">
                  <div>
                    <p>{formatDateRangeKorean(job.workDate, job.endDate ?? job.workDate)}</p>
                    <p className="text-xs text-slate-500">{job.status === "DISPATCHED" ? "배차 완료" : "초안"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Link
                      href={job.status === "DISPATCHED" ? `/jobs/${job.id}/results` : `/jobs/${job.id}/parcels`}
                      className="text-brand-800 hover:underline"
                    >
                      열기
                    </Link>
                    <button
                      onClick={() => handleDeleteJob(job.id, job.workDate, job.endDate ?? job.workDate)}
                      className="rounded-full px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
