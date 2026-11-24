import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { bankruptMoversNationwide, kommuneOverview } from "@/lib/registry/kommune-overview";
import { getCoverage } from "@/lib/registry/queries";
import { ParamError, int } from "@/lib/registry/params";

export const dynamic = "force-dynamic";

/** Key figures per kommune: companies, moves in/out/within, bankruptcies. ?days=365 */
export async function GET(request: NextRequest) {
  try {
    const days = int(request.nextUrl.searchParams.get("days"), 365, 1, 2000);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [rows, coverage, nationwide] = await Promise.all([
      kommuneOverview(prisma, since),
      getCoverage(prisma),
      bankruptMoversNationwide(prisma, since),
    ]);
    return NextResponse.json({
      success: true,
      days,
      coverage,
      total: rows.length,
      bankruptMoversNationwide: nationwide,
      kommuner: rows,
    });
  } catch (error) {
    if (error instanceof ParamError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("registry/kommuner failed:", error);
    return NextResponse.json({ success: false, error: "Failed to load kommuner" }, { status: 500 });
  }
}
