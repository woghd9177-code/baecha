"use client";

import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { OfficeForm } from "@/components/offices/OfficeForm";
import { useDispatchStore, useStoreHydrated } from "@/lib/store";

export default function OfficesPage() {
  const hydrated = useStoreHydrated();
  const offices = useDispatchStore((state) => state.offices);
  const removeOffice = useDispatchStore((state) => state.removeOffice);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`"${name}" 사무실을 삭제할까요? 등록된 차량·배차 작업·필지가 모두 함께 삭제됩니다.`)) {
      return;
    }
    removeOffice(id);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardTitle>새 사무실 등록</CardTitle>
        <OfficeForm />
      </Card>

      <Card>
        <CardTitle>등록된 사무실</CardTitle>
        {!hydrated ? (
          <p className="text-sm text-slate-400">불러오는 중...</p>
        ) : offices.length === 0 ? (
          <p className="text-sm text-slate-500">등록된 사무실이 없습니다. 왼쪽에서 먼저 등록해주세요.</p>
        ) : (
          <ul className="divide-y divide-brand-50">
            {offices.map((office) => (
              <li key={office.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/offices/${office.id}`} className="font-medium text-brand-800 hover:underline">
                    {office.name}
                  </Link>
                  <p className="text-sm text-slate-500">{office.address}</p>
                </div>
                <button
                  onClick={() => handleDelete(office.id, office.name)}
                  className="shrink-0 rounded-full px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
