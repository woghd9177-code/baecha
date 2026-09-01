import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { lookupParcelAtPoint } from "@/lib/vworld/cadastral";

const bodySchema = z.object({ lat: z.number(), lng: z.number() });

// Stateless VWorld cadastral (연속지적도) lookup for a clicked map point.
// Nothing is persisted here — the caller adds the parcel to its own local
// state on success.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const cadastral = await lookupParcelAtPoint(parsed.data.lat, parsed.data.lng);
    if (!cadastral) {
      return NextResponse.json({ error: "해당 위치에서 필지를 찾을 수 없습니다" }, { status: 404 });
    }
    return NextResponse.json(cadastral);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "VWorld 지적도 조회에 실패했습니다" },
      { status: 502 },
    );
  }
}
