import { NextRequest, NextResponse } from "next/server";
import {
  analyzeDataGaps,
  createGapFillingPlan,
  executeGapFilling,
  type DataGapAnalysis,
  type GapFillingPlan,
  type GapFillingResult,
} from "@/lib/intelligent-gap-filler";

/**
 * Intelligent Data Update API
 *
 * This replaces the simple "Oppdater data" button with intelligent gap detection:
 * - GET: Analyze what data is missing
 * - POST: Execute intelligent gap filling
 *
 * Examples:
 * - Missing 200 days → Strategic fill (recent + critical periods)
 * - Missing 1 day → Quick recent fill
 * - Missing 50 days → Complete historical fill
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  try {
    console.log(`🔍 ANALYZING DATA GAPS: Kommune ${kommuneNumber}`);

    // Analyze current data gaps
    const gapAnalysis = await analyzeDataGaps(kommuneNumber);

    // Create a filling plan (but don't execute yet)
    const fillingPlan = await createGapFillingPlan(kommuneNumber);

    return NextResponse.json({
      success: true,
      kommune: {
        number: kommuneNumber,
        name: gapAnalysis.kommuneName,
      },
      dataStatus: {
        completionPercentage: gapAnalysis.completionPercentage,
        totalDays: gapAnalysis.totalDaysPeriod,
        daysWithData: gapAnalysis.daysWithData,
        daysMissing: gapAnalysis.daysMissing,
        priorityLevel: gapAnalysis.priorityLevel,
        lastUpdate: gapAnalysis.lastUpdateDate?.toISOString(),
      },
      gaps: gapAnalysis.gaps.map((gap) => ({
        startDate: gap.startDate.toISOString().split("T")[0],
        endDate: gap.endDate.toISOString().split("T")[0],
        daysCount: gap.daysCount,
        gapType: gap.gapType,
        priority: gap.priority,
        estimatedRecords: gap.estimatedRecords,
      })),
      fillingPlan: {
        strategy: fillingPlan.fillStrategy,
        totalPhases: fillingPlan.phases.length,
        estimatedDuration: fillingPlan.estimatedDuration,
        apiCallsRequired: fillingPlan.apiCallsRequired,
        phases: fillingPlan.phases.map((phase) => ({
          phase: phase.phase,
          description: phase.description,
          dateRange: {
            start: phase.dateRange.start.toISOString().split("T")[0],
            end: phase.dateRange.end.toISOString().split("T")[0],
          },
          priority: phase.priority,
          estimatedTime: phase.estimatedTime,
        })),
      },
      recommendations: generateRecommendations(gapAnalysis, fillingPlan),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `❌ Gap analysis failed for kommune ${kommuneNumber}:`,
      error
    );
    return NextResponse.json(
      {
        success: false,
        error: "Gap analysis failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  try {
    const body = await request.json().catch(() => ({}));
    const { executeNow = false, strategy } = body;

    console.log(`🚀 INTELLIGENT UPDATE: Kommune ${kommuneNumber}`);

    // First, analyze gaps
    const gapAnalysis = await analyzeDataGaps(kommuneNumber);

    if (gapAnalysis.daysMissing === 0) {
      return NextResponse.json({
        success: true,
        message: "No data gaps found - system is up to date",
        kommune: {
          number: kommuneNumber,
          name: gapAnalysis.kommuneName,
        },
        dataStatus: {
          completionPercentage: gapAnalysis.completionPercentage,
          daysMissing: 0,
        },
      });
    }

    if (!executeNow) {
      // Just return the plan without executing
      const fillingPlan = await createGapFillingPlan(kommuneNumber);

      return NextResponse.json({
        success: true,
        message: `Found ${gapAnalysis.daysMissing} days of missing data`,
        kommune: {
          number: kommuneNumber,
          name: gapAnalysis.kommuneName,
        },
        dataStatus: {
          completionPercentage: gapAnalysis.completionPercentage,
          daysMissing: gapAnalysis.daysMissing,
          priorityLevel: gapAnalysis.priorityLevel,
        },
        fillingPlan: {
          strategy: fillingPlan.fillStrategy,
          phases: fillingPlan.phases.length,
          estimatedDuration: fillingPlan.estimatedDuration,
          apiCalls: fillingPlan.apiCallsRequired,
        },
        readyToExecute: true,
      });
    }

    // Execute the gap filling
    console.log(
      `⚡ EXECUTING GAP FILLING: ${gapAnalysis.daysMissing} days missing`
    );

    const result = await executeGapFilling(kommuneNumber, (progress) => {
      console.log(
        `📊 Progress: Phase ${progress.currentPhase}/${progress.totalPhases} - ${progress.overallProgress.toFixed(1)}%`
      );
    });

    // Analyze gaps again to see improvement
    const postFillAnalysis = await analyzeDataGaps(kommuneNumber);

    return NextResponse.json({
      success: result.success,
      message: result.success
        ? `Successfully filled ${result.totalRecordsFilled} records in ${result.duration.toFixed(1)} minutes`
        : `Gap filling completed with some errors`,
      kommune: {
        number: kommuneNumber,
        name: gapAnalysis.kommuneName,
      },
      before: {
        completionPercentage: gapAnalysis.completionPercentage,
        daysMissing: gapAnalysis.daysMissing,
      },
      after: {
        completionPercentage: postFillAnalysis.completionPercentage,
        daysMissing: postFillAnalysis.daysMissing,
      },
      execution: {
        totalRecordsFilled: result.totalRecordsFilled,
        phasesCompleted: result.phasesCompleted,
        totalPhases: result.totalPhases,
        duration: result.duration,
        completedAt: result.completedAt.toISOString(),
      },
      phaseResults: result.phaseResults,
      improvement: {
        percentageImprovement:
          postFillAnalysis.completionPercentage -
          gapAnalysis.completionPercentage,
        daysFilled: gapAnalysis.daysMissing - postFillAnalysis.daysMissing,
      },
    });
  } catch (error) {
    console.error(
      `❌ Intelligent update failed for kommune ${kommuneNumber}:`,
      error
    );
    return NextResponse.json(
      {
        success: false,
        error: "Intelligent update failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function generateRecommendations(
  gapAnalysis: DataGapAnalysis,
  fillingPlan: GapFillingPlan
): string[] {
  const recommendations = [];

  if (gapAnalysis.daysMissing === 0) {
    recommendations.push("✅ Data is complete - no action needed");
    recommendations.push("🔄 Set up daily monitoring to maintain completeness");
    return recommendations;
  }

  if (gapAnalysis.daysMissing <= 7) {
    recommendations.push(
      "🚀 Quick fill recommended - only recent data missing"
    );
    recommendations.push(
      `⏱️ Estimated time: ${fillingPlan.estimatedDuration} minutes`
    );
  } else if (gapAnalysis.daysMissing <= 90) {
    recommendations.push("📊 Complete historical fill recommended");
    recommendations.push(
      `⏱️ Estimated time: ${fillingPlan.estimatedDuration} minutes`
    );
    recommendations.push(
      "🔍 May discover additional fraud patterns in historical data"
    );
  } else {
    recommendations.push(
      "🎯 Strategic fill recommended - focus on recent + critical periods"
    );
    recommendations.push(
      `⏱️ Estimated time: ${fillingPlan.estimatedDuration} minutes`
    );
    recommendations.push(
      "📈 Consider full historical analysis in off-peak hours"
    );
  }

  if (gapAnalysis.priorityLevel === "CRITICAL") {
    recommendations.push("🚨 CRITICAL: Immediate action required");
    recommendations.push(
      "📞 Consider alerting relevant authorities about data gaps"
    );
  }

  if (fillingPlan.apiCallsRequired > 100) {
    recommendations.push("⚠️ High API usage expected - monitor rate limits");
    recommendations.push("🕐 Consider running during off-peak hours");
  }

  recommendations.push("🔄 After filling, set up automated daily updates");
  recommendations.push("📊 Review filled data for new fraud patterns");

  return recommendations;
}
