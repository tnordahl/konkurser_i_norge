import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Database Coverage API
 *
 * GET /api/database-coverage - Compare our database vs total companies in Norway
 */

export async function GET(request: NextRequest) {
  try {
    console.log("📊 Calculating database coverage...");
    const startTime = Date.now();

    // Get our database count
    const ourCompanyCount = await prisma.company.count();

    // Get official Norway total
    const officialResponse = await fetch(
      "https://data.brreg.no/enhetsregisteret/api/enheter?page=0&size=1"
    );
    const officialData = await officialResponse.json();
    const totalNorwayCompanies = officialData.page?.totalElements || 0;

    // Calculate coverage
    const coveragePercentage =
      totalNorwayCompanies > 0
        ? ((ourCompanyCount / totalNorwayCompanies) * 100).toFixed(6)
        : "0";

    const remainingCompanies = totalNorwayCompanies - ourCompanyCount;

    // Estimate time to populate all (based on our 53ms per company performance)
    const avgTimePerCompanyMs = 53;
    const estimatedTimeToPopulateAllMs =
      remainingCompanies * avgTimePerCompanyMs;
    const estimatedHours = Math.round(
      estimatedTimeToPopulateAllMs / (1000 * 60 * 60)
    );
    const estimatedDays = Math.round(estimatedHours / 24);

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      coverage: {
        companiesInOurDatabase: ourCompanyCount,
        totalCompaniesInNorway: totalNorwayCompanies,
        coveragePercentage: `${coveragePercentage}%`,
        remainingToPopulate: remainingCompanies,
      },
      populationEstimate: {
        avgTimePerCompanyMs: avgTimePerCompanyMs,
        estimatedTimeToPopulateAll: {
          milliseconds: estimatedTimeToPopulateAllMs,
          hours: estimatedHours,
          days: estimatedDays,
          humanReadable:
            estimatedDays > 1
              ? `${estimatedDays} days`
              : estimatedHours > 1
                ? `${estimatedHours} hours`
                : `${Math.round(estimatedTimeToPopulateAllMs / (1000 * 60))} minutes`,
        },
      },
      recommendations: {
        approach:
          totalNorwayCompanies > 100000
            ? "Use batch processing with multiple workers"
            : "Single process should work fine",
        batchSize: "Recommended: 100-500 companies per batch",
        monitoring: "Track progress every 10,000 companies",
      },
      metadata: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Database coverage error:", error);
    return NextResponse.json(
      {
        error: "Failed to calculate database coverage",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
