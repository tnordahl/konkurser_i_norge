import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { search } from "@/lib/registry/search";

export const dynamic = "force-dynamic";

/** ?q= company name (incl. former names) / org.nr / address [+ postcode]. */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ success: false, error: "Skriv minst 2 tegn" }, { status: 400 });
  if (q.length > 100) return NextResponse.json({ success: false, error: "For langt søk" }, { status: 400 });
  try {
    const result = await search(prisma, q);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("search failed:", error);
    return NextResponse.json({ success: false, error: "Søket feilet" }, { status: 500 });
  }
}
