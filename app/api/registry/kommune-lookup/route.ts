import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { listKommuner, lookupKommune } from "@/lib/registry/kommuner";

export const dynamic = "force-dynamic";

/**
 * ?q=4201 | 4950 (postnummer) | risør → the kommune it refers to.
 * Without q: the full list (for autocomplete).
 */
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q) return NextResponse.json({ success: true, kommuner: await listKommuner(prisma) });
    if (q.length > 60) return NextResponse.json({ success: false, error: "q is too long" }, { status: 400 });
    return NextResponse.json({ success: true, ...(await lookupKommune(prisma, q)) });
  } catch (error) {
    console.error("kommune-lookup failed:", error);
    return NextResponse.json({ success: false, error: "Lookup failed" }, { status: 500 });
  }
}
