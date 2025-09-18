import { NextRequest, NextResponse } from "next/server";
import { updateAllKommunerData } from "@/lib/data-fetcher";

export async function GET(request: NextRequest) {
  // Verify the request is from Vercel Cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Also check if it's from Vercel's cron system
  const vercelCronHeader = request.headers.get("x-vercel-cron");
  if (process.env.NODE_ENV === "production" && !vercelCronHeader) {
    return NextResponse.json(
      { success: false, error: "Invalid cron request" },
      { status: 401 }
    );
  }

  try {
    console.log("🔄 Starting Vercel cron job: daily bankruptcy data update");

    const startTime = Date.now();
    const result = await updateAllKommunerData();
    const duration = Date.now() - startTime;

    console.log(`✅ Vercel cron job completed in ${duration}ms:`, result);

    return NextResponse.json({
      success: true,
      message: "Daily update completed successfully",
      duration: `${duration}ms`,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Vercel cron job failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Daily update failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
