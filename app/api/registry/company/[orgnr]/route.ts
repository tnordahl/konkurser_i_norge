import { NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { getCompany } from "@/lib/registry/company";

export const dynamic = "force-dynamic";

/** One company: Brreg data, former names, recorded moves, bankruptcy events and archived history. */
export async function GET(_req: Request, { params }: { params: { orgnr: string } }) {
  if (!/^\d{9}$/.test(params.orgnr)) {
    return NextResponse.json({ success: false, error: "orgnr must be 9 digits" }, { status: 400 });
  }
  try {
    const data = await getCompany(prisma, params.orgnr);
    if (!data) return NextResponse.json({ success: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error("registry/company failed:", error);
    return NextResponse.json({ success: false, error: "Failed to load company" }, { status: 500 });
  }
}
