"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { useDispatchStore, EQUIPMENT_TYPE_SUGGESTIONS } from "@/lib/store";

export function WorkTypeManager() {
  const workTypes = useDispatchStore((state) => state.workTypes);
  const addWorkType = useDispatchStore((state) => state.addWorkType);
  const updateWorkType = useDispatchStore((state) => state.updateWorkType);

  const equipmentOptions = Array.from(
    new Set([...EQUIPMENT_TYPE_SUGGESTIONS, ...workTypes.map((wt) => wt.equipmentType).filter(Boolean)]),
  );

  const [newName, setNewName] = useState("");
  const [newEquipmentType, setNewEquipmentType] = useState(equipmentOptions[0] ?? "");
  const [newSpeed, setNewSpeed] = useState(50);
  const [newOverhead, setNewOverhead] = useState(10);

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    addWorkType({
      name: newName,
      equipmentType: newEquipmentType,
      speedValue: newSpeed,
      speedUnit: "sqm_per_min",
      fixedOverheadMin: newOverhead,
    });
    setNewName("");
  }

  return (
    <div>
      <table className="mb-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-brand-100 text-left text-slate-500">
            <th className="py-2">작업유형</th>
            <th className="py-2">필요 장비</th>
            <th className="py-2">처리 속도 (㎡/분)</th>
            <th className="py-2">필지당 준비시간(분)</th>
          </tr>
        </thead>
        <tbody>
          {workTypes.map((wt) => (
            <tr key={wt.id} className="border-b border-brand-50">
              <td className="py-2">{wt.name}</td>
              <td className="py-2">
                <select
                  value={wt.equipmentType || ""}
                  onChange={(e) => updateWorkType(wt.id, { equipmentType: e.target.value })}
                  className={`rounded-lg border px-2 py-1 ${wt.equipmentType ? "border-slate-300" : "border-amber-400 text-amber-700"}`}
                >
                  {!wt.equipmentType && <option value="">미지정</option>}
                  {equipmentOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </td>
              <td className="py-2">
                <input
                  type="number"
                  min={0.01}
                  step="0.1"
                  value={wt.speedValue}
                  onChange={(e) => updateWorkType(wt.id, { speedValue: Number(e.target.value) })}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                />
              </td>
              <td className="py-2">
                <input
                  type="number"
                  min={0}
                  value={wt.fixedOverheadMin}
                  onChange={(e) => updateWorkType(wt.id, { fixedOverheadMin: Number(e.target.value) })}
                  className="w-24 rounded-lg border border-slate-300 px-2 py-1"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mb-4 text-xs text-slate-500">값은 입력하는 즉시 저장됩니다.</p>

      <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-5 sm:items-end">
        <Field>
          <Label htmlFor="wt-name">새 작업유형 이름</Label>
          <Input id="wt-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
        </Field>
        <Field>
          <Label htmlFor="wt-equipment">필요 장비</Label>
          <select
            id="wt-equipment"
            value={newEquipmentType}
            onChange={(e) => setNewEquipmentType(e.target.value)}
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
          <Label htmlFor="wt-speed">처리 속도 (㎡/분)</Label>
          <Input
            id="wt-speed"
            type="number"
            min={0.01}
            step="0.1"
            value={newSpeed}
            onChange={(e) => setNewSpeed(Number(e.target.value))}
            required
          />
        </Field>
        <Field>
          <Label htmlFor="wt-overhead">필지당 준비시간(분)</Label>
          <Input
            id="wt-overhead"
            type="number"
            min={0}
            value={newOverhead}
            onChange={(e) => setNewOverhead(Number(e.target.value))}
            required
          />
        </Field>
        <Button type="submit" className="h-fit">
          작업유형 추가
        </Button>
      </form>
    </div>
  );
}
