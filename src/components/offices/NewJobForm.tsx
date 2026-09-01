"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { useDispatchStore } from "@/lib/store";

export function NewJobForm({ officeId, hasActiveVehicles }: { officeId: string; hasActiveVehicles: boolean }) {
  const router = useRouter();
  const addJob = useDispatchStore((state) => state.addJob);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (endDate < startDate) {
      setError("종료일이 시작일보다 빠를 수 없습니다");
      return;
    }
    const job = addJob({ officeId, workDate: startDate, endDate });
    router.push(`/jobs/${job.id}/parcels`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field>
        <Label htmlFor="job-start-date">작업 기간</Label>
        <div className="flex items-center gap-2">
          <Input
            id="job-start-date"
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (e.target.value > endDate) setEndDate(e.target.value);
            }}
            required
          />
          <span className="text-sm text-slate-500">~</span>
          <Input
            id="job-end-date"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          여러 날짜를 지정하면 등록된 필지를 기간 안에서 최대한 빨리 끝내도록 자동으로 나눠 배차합니다. 하루면
          끝나는 물량이면 하루만 씁니다. 어떤 차량을 몇 대 쓸지는 필지의 작업유형에 맞는 장비를 기준으로 배차
          시 자동으로 정해집니다.
        </p>
      </Field>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={!hasActiveVehicles}>
        작업 생성 및 필지 등록으로 이동
      </Button>
      {!hasActiveVehicles && (
        <p className="mt-2 text-sm text-amber-600">먼저 차량을 최소 1대 등록해주세요.</p>
      )}
    </form>
  );
}
