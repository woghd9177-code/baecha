"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { WorkTypeManager } from "@/components/worktypes/WorkTypeManager";
import { useStoreHydrated } from "@/lib/store";

export default function WorkTypesAdminPage() {
  const hydrated = useStoreHydrated();

  return (
    <Card>
      <CardTitle>작업유형별 처리 속도 설정</CardTitle>
      <p className="mb-4 text-sm text-slate-500">
        필지 면적 ÷ 처리 속도 + 필지당 준비시간으로 예상 작업시간을 계산합니다. 초기값은 임의의 추정치이므로
        실제 작업 속도에 맞게 조정해주세요. 필요 장비는 배차 시 해당 장비를 가진 차량에만 배정하는 데
        쓰입니다(예: 방제 → 드론). 차량 등록 시 장비 종류를 여기와 동일하게 선택해야 매칭됩니다. 이 값은
        브라우저에만 저장됩니다.
      </p>
      {hydrated ? <WorkTypeManager /> : <p className="text-sm text-slate-400">불러오는 중...</p>}
    </Card>
  );
}
