import { NextRequest, NextResponse } from "next/server";
import { completeDatasetProcessor } from "@/lib/complete-dataset-processor";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const downloadNew = searchParams.get("download") === "true";
    const filePath = searchParams.get("file") || "assets/enheter_alle.json";

    console.log("🚀 Starting complete dataset processing...");
    console.log(`📁 File: ${filePath}`);
    console.log(`📥 Download new: ${downloadNew}`);

    let targetFile = filePath;

    // Download latest dataset if requested
    if (downloadNew) {
      console.log("📥 Downloading latest dataset...");
      targetFile = await completeDatasetProcessor.downloadLatestDataset();
    }

    // Check if file exists
    const fs = await import("fs");
    const fullPath = path.resolve(targetFile);

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json(
        {
          success: false,
          error: `File not found: ${fullPath}`,
        },
        { status: 404 }
      );
    }

    // Start processing (this will run in background)
    const result =
      await completeDatasetProcessor.processCompleteDataset(fullPath);

    return NextResponse.json({
      success: true,
      message: "Complete dataset processing finished",
      file: targetFile,
      ...result,
    });
  } catch (error) {
    console.error("❌ Error in complete dataset processing:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const status = completeDatasetProcessor.getProcessingStatus();

    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("❌ Error getting processing status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

