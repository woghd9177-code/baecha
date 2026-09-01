import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listParcelsInBbox } from "@/lib/vworld/cadastral";
import { describeError } from "@/lib/httpRetry";

const bodySchema = z.object({
  minLng: z.number(),
  minLat: z.number(),
  maxLng: z.number(),
  maxLat: z.number(),
});

// Lists cadastral parcel boundaries within the map's current viewport, so
// they can be drawn before the user picks one — see cadastral.ts for why.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const parcels = await listParcelsInBbox(parsed.data);
    return NextResponse.json({ parcels });
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }
}
