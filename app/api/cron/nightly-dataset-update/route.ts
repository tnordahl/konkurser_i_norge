import { NextRequest, NextResponse } from "next/server";
import { nightlyDatasetService } from "@/lib/nightly-dataset-service";

export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request
    const authHeader = request.headers.get("authorization");
    if (
      process.env.NODE_ENV === "production" &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🌙 Nightly dataset update triggered by cron job");

    const result = await nightlyDatasetService.runNightlyUpdate();

    return NextResponse.json({
      success: true,
      message: "Nightly dataset update completed",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error in nightly dataset update:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const status = nightlyDatasetService.getComparisonStatus();
    const updateInfo = await nightlyDatasetService.getLastUpdateInfo();

    return NextResponse.json({
      success: true,
      status,
      updateInfo,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Error getting nightly update status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

