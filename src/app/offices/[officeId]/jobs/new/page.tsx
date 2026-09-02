"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";

// Date range and parcel registration used to be two separate steps (a form
// here, then a redirect to /jobs/[jobId]/parcels). They're now one page —
// this route just creates the draft job immediately (defaulting to today,
// editable right on the parcels page) and hands off, instead of making the
// user fill out a form before they can even start registering parcels.
export default function NewJobPage() {
  const { officeId } = useParams<{ officeId: string }>();
  const router = useRouter();
  const hydrated = useStoreHydrated();
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === officeId));
  const activeVehicleCount = useDispatchStore(
    (state) => state.vehicles.filter((v) => v.officeId === officeId && v.active).length,
  );
  const addJob = useDispatchStore((state) => state.addJob);
  const createdRef = useRef(false);

  useEffect(() => {
    if (!hydrated || !office || activeVehicleCount === 0 || createdRef.current) return;
    createdRef.current = true;
    const today = new Date().toISOString().slice(0, 10);
    const job = addJob({ officeId: office.id, workDate: today, endDate: today });
    router.replace(`/jobs/${job.id}/parcels`);
  }, [hydrated, office, activeVehicleCount, addJob, router]);

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

  if (activeVehicleCount === 0) {
    return (
      <Card>
        <p className="text-sm text-amber-600">
          먼저 차량을 최소 1대 등록해주세요.{" "}
          <Link href={`/offices/${office.id}/vehicles`} className="underline">
            차량 관리
          </Link>
        </p>
      </Card>
    );
  }

  return <p className="text-sm text-slate-400">작업을 준비하는 중...</p>;
}
