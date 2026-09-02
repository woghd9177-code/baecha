"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { ParcelWorkspace } from "@/components/parcels/ParcelWorkspace";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";

export default function ParcelsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const hydrated = useStoreHydrated();
  const job = useDispatchStore((state) => state.jobs.find((j) => j.id === jobId));
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === job?.officeId));
  const workTypes = useDispatchStore((state) => state.workTypes);
  const parcelCount = useDispatchStore((state) => state.parcels.filter((p) => p.jobId === jobId).length);
  const updateJob = useDispatchStore((state) => state.updateJob);
  const [dateError, setDateError] = useState<string | null>(null);

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

  function handleStartDateChange(value: string) {
    setDateError(null);
    updateJob(jobId, job!.endDate < value ? { workDate: value, endDate: value } : { workDate: value });
  }

  function handleEndDateChange(value: string) {
    if (value < job!.workDate) {
      setDateError("종료일이 시작일보다 빠를 수 없습니다");
      return;
    }
    setDateError(null);
    updateJob(jobId, { endDate: value });
  }

  return (
    <div className="grid gap-6">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{office.name}</p>
          <h1 className="text-lg font-semibold">필지 등록</h1>
        </div>
        <Link href={`/jobs/${job.id}/dispatch`}>
          <Button disabled={parcelCount === 0}>다음: 작업 분류 및 배차 →</Button>
        </Link>
      </Card>

      <Card>
        <Field>
          <Label htmlFor="job-start-date">작업 기간</Label>
          <div className="flex items-center gap-2">
            <Input
              id="job-start-date"
              type="date"
              value={job.workDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
            />
            <span className="text-sm text-slate-500">~</span>
            <Input
              id="job-end-date"
              type="date"
              value={job.endDate}
              min={job.workDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            여러 날짜를 지정하면 등록된 필지를 기간 안에서 최대한 빨리 끝내도록 자동으로 나눠 배차합니다. 하루면
            끝나는 물량이면 하루만 씁니다. 어떤 차량을 몇 대 쓸지는 필지의 작업유형에 맞는 장비를 기준으로 배차
            시 자동으로 정해집니다.
          </p>
          {dateError && <p className="mt-1 text-sm text-red-600">{dateError}</p>}
        </Field>
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
