"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { useDispatchStore, EQUIPMENT_TYPE_SUGGESTIONS, type Vehicle } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";

export function VehicleManager({ officeId }: { officeId: string }) {
  const vehicles = useDispatchStore(useShallow((state) => state.vehicles.filter((v) => v.officeId === officeId)));
  const addVehicle = useDispatchStore((state) => state.addVehicle);
  const updateVehicle = useDispatchStore((state) => state.updateVehicle);
  const removeVehicle = useDispatchStore((state) => state.removeVehicle);

  const equipmentOptions = Array.from(
    new Set([...EQUIPMENT_TYPE_SUGGESTIONS, ...vehicles.map((v) => v.equipmentType).filter(Boolean)]),
  );

  const [label, setLabel] = useState("");
  const [equipmentType, setEquipmentType] = useState(equipmentOptions[0] ?? "");
  const [dailyCapacityMin, setDailyCapacityMin] = useState(480);
  const [dayStartTime, setDayStartTime] = useState("08:00");

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    addVehicle({ officeId, label, equipmentType, dailyCapacityMin, dayStartTime });
    setLabel("");
  }

  function toggleActive(vehicle: Vehicle) {
    updateVehicle(vehicle.id, { active: !vehicle.active });
  }

  return (
    <div>
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-brand-100 text-left text-slate-500">
            <th className="py-2">이름</th>
            <th className="py-2">장비 종류</th>
            <th className="py-2">시작 시각</th>
            <th className="py-2">일일 작업 용량(분)</th>
            <th className="py-2">상태</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id} className="border-b border-brand-50">
              <td className="py-2">{v.label}</td>
              <td className="py-2">
                <select
                  value={v.equipmentType || ""}
                  onChange={(e) => updateVehicle(v.id, { equipmentType: e.target.value })}
                  className={`rounded-lg border px-2 py-1 ${v.equipmentType ? "border-slate-300" : "border-amber-400 text-amber-700"}`}
                >
                  {!v.equipmentType && <option value="">미지정</option>}
                  {equipmentOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2">{v.dayStartTime}</td>
              <td className="py-2">{v.dailyCapacityMin}</td>
              <td className="py-2">
                <button
                  onClick={() => toggleActive(v)}
                  className={v.active ? "text-brand-700" : "text-slate-400"}
                >
                  {v.active ? "활성" : "비활성"}
                </button>
              </td>
              <td className="py-2 text-right">
                <button onClick={() => removeVehicle(v.id)} className="text-red-600 hover:underline">
                  삭제
                </button>
              </td>
            </tr>
          ))}
          {vehicles.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-slate-400">
                등록된 차량이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-5 sm:items-end">
        <Field>
          <Label htmlFor="vehicle-label">이름</Label>
          <Input id="vehicle-label" value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>
        <Field>
          <Label htmlFor="vehicle-equipment">장비 종류</Label>
          <select
            id="vehicle-equipment"
            value={equipmentType}
            onChange={(e) => setEquipmentType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            required
          >
            {equipmentOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <Label htmlFor="vehicle-start">시작 시각</Label>
          <Input
            id="vehicle-start"
            type="time"
            value={dayStartTime}
            onChange={(e) => setDayStartTime(e.target.value)}
            required
          />
        </Field>
        <Field>
          <Label htmlFor="vehicle-capacity">일일 용량(분)</Label>
          <Input
            id="vehicle-capacity"
            type="number"
            min={1}
            value={dailyCapacityMin}
            onChange={(e) => setDailyCapacityMin(Number(e.target.value))}
            required
          />
        </Field>
        <Button type="submit" className="h-fit">
          차량 추가
        </Button>
      </form>
    </div>
  );
}
