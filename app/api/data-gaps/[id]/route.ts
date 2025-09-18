import { NextRequest, NextResponse } from "next/server";
import { getKommuneDataCoverage } from "@/lib/data-fetcher";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const kommuneNumber = params.id;

    console.log(`🔍 Fetching data coverage for kommune ${kommuneNumber}`);

    const coverage = await getKommuneDataCoverage(kommuneNumber);

    return NextResponse.json({
      success: true,
      kommuneNumber,
      statistics: {
        coveragePercentage: coverage.coverage,
        totalDays: coverage.totalDays,
        totalMissingDays: coverage.missingDays,
        totalGaps: coverage.dataGaps.length,
      },
      gaps: coverage.dataGaps,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `❌ Failed to fetch data gaps for kommune ${params.id}:`,
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch data coverage",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
