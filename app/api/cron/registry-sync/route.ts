import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { ingestFeed, resolvePending } from "@/lib/registry/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily: read new Brreg feed updates (address changes, bankruptcies), then
 * fill in company names / kommuner from the registry.
 * Vercel Cron calls this with GET and `Authorization: Bearer $CRON_SECRET`.
 * Fails closed: without CRON_SECRET configured it refuses to run in production.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret ? auth !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    // Leave headroom under maxDuration for the resolve pass.
    const ingest = await ingestFeed(prisma, { deadline: started + 35_000, log: console.log });
    const resolve = ingest.caughtUp
      ? await resolvePending(prisma, { limit: 2000, maxSingles: 50, log: console.log })
      : { skipped: "feed not caught up yet — run scripts/registry-sync.ts for the backfill" };
    return NextResponse.json({ success: true, durationMs: Date.now() - started, ingest, resolve });
  } catch (error) {
    console.error("registry-sync failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
