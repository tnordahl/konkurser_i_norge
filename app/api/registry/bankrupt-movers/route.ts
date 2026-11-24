import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import {
  BANKRUPT_SORTS,
  getCoverage,
  listBankruptMovers,
  type BankruptSort,
} from "@/lib/registry/queries";
import { ParamError, int, parseBankruptcyTypes, parseCommon } from "@/lib/registry/params";

export const dynamic = "force-dynamic";

/**
 * Companies that changed business address before going bankrupt.
 * ?kommune=4201&days=365 (bankruptcies in the last N days)&window=365 (move at most N days before)
 * &types=KONKURS,TVANGSAVVIKLING&moveTypes=CROSS_KOMMUNE&limit=200
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const p = parseCommon(sp);
    const windowDays = int(sp.get("window"), 365, 1, 1000);
    const types = parseBankruptcyTypes(sp.get("types"));
    const sortRaw = sp.get("sort") ?? "eventDate";
    if (!(BANKRUPT_SORTS as readonly string[]).includes(sortRaw)) {
      throw new ParamError(`sort must be one of ${BANKRUPT_SORTS.join(", ")}`);
    }
    const sort = sortRaw as BankruptSort;
    const order = sp.get("order") === "asc" ? "asc" : "desc";
    const [rows, coverage] = await Promise.all([
      listBankruptMovers(prisma, {
        kommune: p.kommune,
        since: p.since,
        windowDays,
        types,
        moveTypes: p.moveTypes,
        sort,
        order,
        limit: p.limit,
      }),
      getCoverage(prisma),
    ]);
    return NextResponse.json({
      success: true,
      coverage,
      query: { ...p, windowDays, types: types ?? ["KONKURS"], sort, order },
      total: rows.length,
      companies: rows,
    });
  } catch (error) {
    if (error instanceof ParamError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    console.error("registry/bankrupt-movers failed:", error);
    return NextResponse.json({ success: false, error: "Failed to load bankrupt movers" }, { status: 500 });
  }
}
