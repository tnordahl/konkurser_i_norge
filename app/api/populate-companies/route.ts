import { NextRequest, NextResponse } from "next/server";
import {
  companyPopulationService,
  PopulationOptions,
} from "@/lib/company-population-service";

/**
 * Company Population API
 *
 * POST /api/populate-companies - Start population process
 * GET /api/populate-companies - Get population progress
 * DELETE /api/populate-companies - Stop population process
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const options: PopulationOptions = {
      startPage: body.startPage || 0,
      maxPages: body.maxPages || 10, // Default to 10 pages for testing
      batchSize: body.batchSize || 100,
      delayBetweenBatches: body.delayBetweenBatches || 1000,
      skipExisting: body.skipExisting !== false, // Default true
      kommuneFilter: body.kommuneFilter,
    };

    console.log("🚀 Starting company population with options:", options);

    // Start population in background (don't await)
    companyPopulationService.startPopulation(options).catch((error) => {
      console.error("Population process failed:", error);
    });

    return NextResponse.json({
      success: true,
      message: "Company population started",
      options,
      timestamp: new Date().toISOString(),
      note: "Process running in background. Use GET to check progress.",
    });
  } catch (error) {
    console.error("Start population error:", error);
    return NextResponse.json(
      {
        error: "Failed to start population",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const progress = companyPopulationService.getProgress();

    if (!progress) {
      return NextResponse.json({
        success: true,
        status: "NOT_RUNNING",
        message: "No population process is currently running",
        timestamp: new Date().toISOString(),
      });
    }

    // Calculate additional stats
    const elapsedMs = Date.now() - progress.startTime.getTime();
    const companiesPerSecond =
      progress.processedCompanies > 0
        ? Math.round(progress.processedCompanies / (elapsedMs / 1000))
        : 0;
    const completionPercentage =
      progress.totalCompanies > 0
        ? (
            (progress.processedCompanies / progress.totalCompanies) *
            100
          ).toFixed(2)
        : "0";

    return NextResponse.json({
      success: true,
      progress: {
        ...progress,
        elapsedTime: formatDuration(elapsedMs),
        companiesPerSecond,
        completionPercentage: `${completionPercentage}%`,
        successRate:
          progress.processedCompanies > 0
            ? `${(((progress.processedCompanies - progress.errorCount) / progress.processedCompanies) * 100).toFixed(1)}%`
            : "100%",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Get progress error:", error);
    return NextResponse.json(
      {
        error: "Failed to get progress",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    companyPopulationService.stop();

    return NextResponse.json({
      success: true,
      message: "Population process stop requested",
      note: "Process will stop after completing current batch",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Stop population error:", error);
    return NextResponse.json(
      {
        error: "Failed to stop population",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper function to format duration
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
