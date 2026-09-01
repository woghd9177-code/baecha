"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Card, CardTitle } from "@/components/ui/card";
import { VehicleManager } from "@/components/offices/VehicleManager";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";

export default function VehiclesPage() {
  const { officeId } = useParams<{ officeId: string }>();
  const hydrated = useStoreHydrated();
  const office = useDispatchStore((state) => state.offices.find((o) => o.id === officeId));

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

  return (
    <Card>
      <CardTitle>{office.name} · 차량/작업자 관리</CardTitle>
      <VehicleManager officeId={office.id} />
    </Card>
  );
}
