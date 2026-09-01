import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { geocodeAddress } from "@/lib/vworld/geocode";
import { lookupParcelAtPoint } from "@/lib/vworld/cadastral";

export interface ExcelRowResult {
  row: number;
  address: string;
  status: "ok" | "error";
  message?: string;
  lat?: number;
  lng?: number;
  pnu?: string;
  geometry?: unknown;
  areaSqm?: number;
  workTypeName?: string;
}

// Stateless: parses the uploaded sheet, geocodes each address via VWorld, and
// looks up cadastral info — but does not persist anything. The caller (the
// browser) is responsible for adding successful rows to its own local state.
//
// Expected columns (Korean or English header): 주소/address (required),
// 면적/area (optional, sqm — falls back to VWorld cadastral area if omitted),
// 작업유형/workType (optional — the caller resolves this to a local work type).
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "엑셀 파일이 필요합니다" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const results: ExcelRowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const address = String(row["주소"] ?? row["address"] ?? "").trim();
    const rowNumber = i + 2; // header is row 1

    if (!address) {
      results.push({ row: rowNumber, address: "", status: "error", message: "주소가 비어 있습니다" });
      continue;
    }

    try {
      const geocoded = await geocodeAddress(address);
      const cadastral = await lookupParcelAtPoint(geocoded.lat, geocoded.lng).catch(() => null);
      const areaFromSheet = Number(row["면적"] ?? row["area"] ?? 0);
      const workTypeName = String(row["작업유형"] ?? row["workType"] ?? "").trim() || undefined;

      results.push({
        row: rowNumber,
        address: geocoded.roadAddress || address,
        status: "ok",
        lat: geocoded.lat,
        lng: geocoded.lng,
        pnu: cadastral?.pnu,
        geometry: cadastral?.geometry,
        areaSqm: areaFromSheet > 0 ? areaFromSheet : (cadastral?.areaSqm ?? 0),
        workTypeName,
      });
    } catch (err) {
      results.push({
        row: rowNumber,
        address,
        status: "error",
        message: err instanceof Error ? err.message : "처리 중 오류가 발생했습니다",
      });
    }
  }

  return NextResponse.json({ results });
}
