import { NextRequest, NextResponse } from "next/server";
import { updateAllKommunerData, updateKommuneData } from "@/lib/data-fetcher";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, kommuneNumber, kommuneId } = body;

    // Support both kommuneNumber and kommuneId for backward compatibility
    const id = kommuneNumber || kommuneId;

    console.log("🔄 Manual sync triggered:", { type, kommuneNumber: id });

    let result;

    if (type === "single" && id) {
      // Sync single kommune
      result = await updateKommuneData(id);
      console.log(`✅ Single kommune sync completed for ${id}:`, result);

      return NextResponse.json({
        success: true,
        message: `Kommune ${id} updated successfully`,
        type: "single",
        kommuneNumber: id,
        ...result,
        timestamp: new Date().toISOString(),
      });
    } else if (type === "all") {
      // Sync all kommuner
      const startTime = Date.now();
      result = await updateAllKommunerData();
      const duration = Date.now() - startTime;

      console.log(`✅ Full sync completed in ${duration}ms:`, result);

      return NextResponse.json({
        success: true,
        message: "All kommuner updated successfully",
        type: "all",
        duration: `${duration}ms`,
        ...result,
        timestamp: new Date().toISOString(),
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid sync type. Use "single" with kommuneNumber or "all"',
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("❌ Manual sync failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Sync failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
