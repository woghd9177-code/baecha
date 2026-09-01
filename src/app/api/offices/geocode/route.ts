import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/vworld/geocode";
import { describeError } from "@/lib/httpRetry";

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
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }
}
