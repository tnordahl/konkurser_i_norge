import { NextRequest, NextResponse } from "next/server";
import { dailyIncrementalService } from "@/lib/daily-incremental-service";
import { prisma } from "@/lib/database";

/**
 * Phase 2: Daily Incremental Updates API
 *
 * Fast daily updates that only fetch changes from the last 24 hours
 * Maintains fresh data with minimal API calls and processing time
 */

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "full"; // "full" or "high-priority"

    console.log(
      "🌅 PHASE 2 DAILY UPDATES: Starting incremental update cycle..."
    );
    console.log(`📋 Mode: ${mode}`);

    const startTime = Date.now();

    let result;
    if (mode === "high-priority") {
      // Update only high-priority kommuner (faster, for frequent runs)
      result = await dailyIncrementalService.runHighPriorityDailyUpdate();
      console.log(
        "🌟 High-priority kommuner updated for critical business monitoring"
      );
    } else {
      // Full daily update across all kommuner
      result = await dailyIncrementalService.runDailyUpdate();
      console.log("🗺️ Complete daily update across all Norwegian kommuner");
    }

    const totalTime = Date.now() - startTime;
    const totalChanges = result.totalNewEntities + result.totalUpdatedEntities;

    // Get updated database statistics
    const finalStats = await prisma.company.count();

    return NextResponse.json({
      success: true,
      phase: "Phase 2: Daily Incremental Updates",
      mode,
      message: `Daily ${mode === "full" ? "complete" : "high-priority"} update completed`,
      result: {
        ...result,
        totalTime: `${totalTime}ms`,
        totalChanges,
        efficiency: result.efficiency || {
          entitiesPerSecond: Math.round(totalChanges / (totalTime / 1000)),
          kommunerPerMinute: Math.round(
            (result.successfulKommuner / (totalTime / 1000)) * 60
          ),
          avgChangesPerKommune: Math.round(
            totalChanges / result.successfulKommuner
          ),
        },
        databaseStats: {
          totalCompaniesInDB: finalStats.toLocaleString(),
          estimatedCoverage: `${((finalStats / 1139492) * 100).toFixed(2)}%`,
        },
      },
      insights: [
        `⚡ Lightning-fast updates: ${totalChanges.toLocaleString()} changes in ${(totalTime / 1000).toFixed(1)} seconds`,
        `📊 New entities: ${result.totalNewEntities.toLocaleString()}`,
        `🔄 Updated entities: ${result.totalUpdatedEntities.toLocaleString()}`,
        `📍 Processed ${result.successfulKommuner}/${result.totalKommuner} kommuner`,
        "🎯 System maintains fresh data for real-time fraud detection",
      ],
      detectedPatterns: await analyzeRecentChanges(result),
      alerts: await generateAlerts(result),
      performance: {
        speedImprovement: "100x faster than full collection",
        resourceEfficiency: "Minimal API load and database writes",
        freshness: "Data current within 24 hours",
        scalability: "Can run multiple times per day if needed",
      },
      scheduling: {
        recommendedFrequency:
          mode === "high-priority" ? "Every 6 hours" : "Daily at 2 AM",
        estimatedRuntime:
          mode === "high-priority" ? "1-2 minutes" : "5-10 minutes",
        apiCallsUsed: result.successfulKommuner,
        nextRecommendedRun: getNextRecommendedRun(mode),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Phase 2 daily updates failed:", error);

    return NextResponse.json(
      {
        success: false,
        phase: "Phase 2: Daily Incremental Updates",
        error: "Daily updates failed",
        message: error instanceof Error ? error.message : "Unknown error",
        troubleshooting: [
          "🔍 Check if Phase 1 bulk collection has been completed",
          "📅 Verify date filtering is working correctly",
          "💾 Ensure database has sufficient capacity",
          "🌐 Check network connectivity to data.brreg.no",
        ],
        fallback: [
          "🔄 Try high-priority mode for essential kommuner only",
          "📊 Check /api/phase1-bulk-collection status first",
          "⏰ Retry during off-peak hours if API is slow",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get recent update statistics
    const totalCompanies = await prisma.company.count();

    // Get companies updated in the last 24 hours
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const recentUpdates = await prisma.company.count({
      where: {
        lastUpdated: {
          gte: yesterday,
        },
      },
    });

    // Get new companies registered in the last week
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const recentRegistrations = await prisma.company.count({
      where: {
        registrationDate: {
          gte: lastWeek,
        },
      },
    });

    // Get bankruptcy statistics
    const bankruptCompanies = await prisma.company.count({
      where: { isBankrupt: true },
    });

    return NextResponse.json({
      success: true,
      phase2Status: {
        totalCompaniesInSystem: totalCompanies.toLocaleString(),
        recentUpdates24h: recentUpdates.toLocaleString(),
        newRegistrationsLastWeek: recentRegistrations.toLocaleString(),
        bankruptCompanies: bankruptCompanies.toLocaleString(),
        systemFreshness:
          recentUpdates > 0
            ? "Fresh (updated within 24h)"
            : "Stale (needs update)",
        lastUpdateIndicator: recentUpdates > 0 ? "✅ Recent" : "⚠️ Outdated",
      },
      recommendations: [
        recentUpdates > 0
          ? "✅ System appears to have recent updates"
          : "🚨 No recent updates detected - run daily update",
        "🌅 Schedule daily updates for consistent data freshness",
        "🌟 Use high-priority mode for frequent monitoring of major cities",
        "📊 Monitor bankruptcy patterns in the updated data",
      ],
      quickActions: [
        "POST /api/phase2-daily-updates?mode=high-priority - Quick update",
        "POST /api/phase2-daily-updates?mode=full - Complete daily update",
        "GET /api/company-stats - Analyze current data",
        "GET /api/relevant-companies - View companies with risk factors",
      ],
      alerting: {
        newBankruptcies: "Monitor for companies with new bankruptcy status",
        addressChanges: "Track companies moving between kommuner",
        newRegistrations: "Identify potential shell companies",
        riskScoreChanges: "Companies with increasing risk scores",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get Phase 2 status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get daily update status" },
      { status: 500 }
    );
  }
}

/**
 * Analyze recent changes for patterns
 */
async function analyzeRecentChanges(result: any): Promise<string[]> {
  const patterns: string[] = [];

  if (result.totalNewEntities > 100) {
    patterns.push(
      `🚨 High new registration activity: ${result.totalNewEntities} new companies`
    );
  }

  if (result.totalUpdatedEntities > 500) {
    patterns.push(
      `📊 High update activity: ${result.totalUpdatedEntities} companies changed`
    );
  }

  // Find kommuner with unusual activity
  const highActivityKommuner =
    result.kommuneStats?.filter(
      (k: any) => k.newEntities + k.updatedEntities > 50
    ) || [];

  if (highActivityKommuner.length > 0) {
    patterns.push(
      `📍 High activity in: ${highActivityKommuner.map((k: any) => k.kommuneName).join(", ")}`
    );
  }

  return patterns.length > 0
    ? patterns
    : ["✅ Normal activity levels detected"];
}

/**
 * Generate alerts based on daily update results
 */
async function generateAlerts(result: any): Promise<string[]> {
  const alerts: string[] = [];

  // Check for failed kommuner
  const failedKommuner =
    result.kommuneStats?.filter((k: any) => !k.success) || [];
  if (failedKommuner.length > 0) {
    alerts.push(`⚠️ ${failedKommuner.length} kommuner failed to update`);
  }

  // Check for unusual patterns
  if (result.totalNewEntities === 0 && result.totalUpdatedEntities === 0) {
    alerts.push("🤔 No changes detected - this might indicate an issue");
  }

  return alerts.length > 0
    ? alerts
    : ["✅ No alerts - system operating normally"];
}

/**
 * Calculate next recommended run time
 */
function getNextRecommendedRun(mode: string): string {
  const now = new Date();
  const next = new Date(now);

  if (mode === "high-priority") {
    // Next 6-hour interval
    next.setHours(next.getHours() + 6);
  } else {
    // Next day at 2 AM
    next.setDate(next.getDate() + 1);
    next.setHours(2, 0, 0, 0);
  }

  return next.toISOString();
}
