import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { getCoverage, listMoves } from "@/lib/registry/queries";
import { ParamError, parseCommon, parseDirection } from "@/lib/registry/params";

export const dynamic = "force-dynamic";

/**
 * Business-address changes registered in Brreg.
 * ?kommune=4201&direction=any|in|out|within&days=30&moveTypes=CROSS_KOMMUNE,NEW_POSTCODE&limit=100&offset=0
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const p = parseCommon(sp);
    const direction = parseDirection(sp.get("direction"));
    const [result, coverage] = await Promise.all([
      listMoves(prisma, {
        kommune: p.kommune,
        direction,
        since: p.since,
        types: p.moveTypes,
        limit: p.limit,
        offset: p.offset,
      }),
      getCoverage(prisma),
    ]);
    return NextResponse.json({ success: true, coverage, query: { ...p, direction }, ...result });
  } catch (error) {
    if (error instanceof ParamError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("registry/moves failed:", error);
    return NextResponse.json({ success: false, error: "Failed to load moves" }, { status: 500 });
  }
}
