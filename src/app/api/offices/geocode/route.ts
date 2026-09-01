import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/vworld/geocode";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const address = body?.address;

  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const result = await geocodeAddress(address);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "지오코딩에 실패했습니다" },
      { status: 502 },
    );
  }
}
