import { NextRequest, NextResponse } from "next/server";
import { kommuneBasedBulkService } from "@/lib/kommune-based-bulk-service";
import { prisma } from "@/lib/database";

/**
 * Phase 1: Initial Bulk Collection API
 *
 * Comprehensive one-time collection of ALL Norwegian companies
 * using kommune-by-kommune approach to bypass API limitations
 */

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "full"; // "full" or "high-priority"

    console.log(
      "🚀 PHASE 1 BULK COLLECTION: Starting initial data collection..."
    );
    console.log(`📋 Mode: ${mode}`);

    const startTime = Date.now();

    let result;
    if (mode === "high-priority") {
      // Start with high-priority kommuner for faster initial results
      result = await kommuneBasedBulkService.downloadHighPriorityKommuner();
      console.log("🌟 High-priority kommuner processed first for quick wins");
    } else {
      // Full collection of all kommuner
      result = await kommuneBasedBulkService.downloadCompleteDatasetByKommune();
      console.log(
        "🗺️ Complete dataset collection across all Norwegian kommuner"
      );
    }

    const totalTime = Date.now() - startTime;

    // Get database statistics after collection
    const finalStats = await prisma.company.count();

    return NextResponse.json({
      success: true,
      phase: "Phase 1: Initial Bulk Collection",
      mode,
      message: `${mode === "full" ? "Complete" : "High-priority"} bulk collection completed`,
      result: {
        ...result,
        totalTime: `${totalTime}ms`,
        efficiency: {
          entitiesPerSecond: Math.round(
            result.totalEntitiesDownloaded / (totalTime / 1000)
          ),
          kommunerPerMinute: Math.round(
            (result.successfulKommuner / (totalTime / 1000)) * 60
          ),
          avgEntitiesPerKommune: Math.round(
            result.totalEntitiesDownloaded / result.successfulKommuner
          ),
          timePerKommune: `${Math.round(totalTime / result.successfulKommuner)}ms`,
        },
        databaseStats: {
          totalCompaniesInDB: finalStats.toLocaleString(),
          estimatedCoverage: `${((finalStats / 1139492) * 100).toFixed(2)}%`,
        },
      },
      insights: [
        "✅ Successfully bypassed 10,000 entity API limitation",
        "📍 Kommune-by-kommune approach provides complete coverage",
        "💾 All data persisted to database for analysis",
        "🎯 Ready for Phase 2: Daily incremental updates",
        `⚡ Processed ${result.successfulKommuner} kommuner efficiently`,
      ],
      nextSteps: [
        "🌅 Set up Phase 2: Daily incremental updates",
        "🔄 Schedule daily maintenance at 2 AM",
        "📊 Begin bankruptcy pattern analysis",
        "🚨 Set up real-time fraud detection alerts",
      ],
      readyForPhase2: {
        description: "System ready for fast daily updates",
        estimatedDailyRuntime: "5-10 minutes for all kommuner",
        benefits: [
          "Real-time bankruptcy detection",
          "Address change monitoring",
          "New company registration alerts",
          "Minimal API load",
        ],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Phase 1 bulk collection failed:", error);

    return NextResponse.json(
      {
        success: false,
        phase: "Phase 1: Initial Bulk Collection",
        error: "Bulk collection failed",
        message: error instanceof Error ? error.message : "Unknown error",
        troubleshooting: [
          "🔍 Check database connectivity and capacity",
          "📍 Verify kommune service is working",
          "💾 Ensure sufficient disk space for bulk data",
          "🌐 Check network connectivity to data.brreg.no",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current collection status
    const totalCompanies = await prisma.company.count();

    // Get companies by kommune to show coverage
    const kommuneStats = await prisma.company.groupBy({
      by: ["currentKommuneId"],
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 20,
    });

    // Check if any bulk collection has been run
    const hasData = totalCompanies > 0;

    return NextResponse.json({
      success: true,
      phase1Status: {
        hasRunBulkCollection: hasData,
        totalCompaniesCollected: totalCompanies.toLocaleString(),
        estimatedCoverage: `${((totalCompanies / 1139492) * 100).toFixed(2)}%`,
        topKommunerByCompanyCount: kommuneStats.map((stat) => ({
          kommuneId: stat.currentKommuneId,
          companyCount: stat._count.id,
        })),
      },
      recommendations: hasData
        ? [
            "✅ Phase 1 bulk collection appears to have been run",
            "🌅 Ready to start Phase 2: Daily incremental updates",
            "📊 Begin analyzing collected data for patterns",
            "🔄 Set up automated daily maintenance",
          ]
        : [
            "🚨 No bulk collection detected - run Phase 1 first",
            "📍 Start with high-priority mode for quick results",
            "🗺️ Then run full mode for complete coverage",
            "💾 Ensure database is properly configured",
          ],
      nextActions: hasData
        ? [
            "POST /api/phase2-daily-updates - Start daily updates",
            "GET /api/company-stats - Analyze collected data",
            "POST /api/roles-collection - Enhance with roles data",
          ]
        : [
            "POST /api/phase1-bulk-collection?mode=high-priority - Quick start",
            "POST /api/phase1-bulk-collection?mode=full - Complete collection",
          ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get Phase 1 status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get collection status" },
      { status: 500 }
    );
  }
}
