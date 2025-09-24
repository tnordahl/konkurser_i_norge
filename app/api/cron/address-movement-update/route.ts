import { NextRequest, NextResponse } from "next/server";
import { dailyIncrementalService } from "@/lib/daily-incremental-service";
import { prisma } from "@/lib/database";

/**
 * Address Movement Update Cron Job
 *
 * Specifically designed to collect NEW address changes and add NEW companies
 * This ensures we only show REAL address movement data, never synthetic data
 */

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
    console.log("🏠 Starting Address Movement Update Cron Job...");
    const startTime = Date.now();

    // Step 1: Run daily incremental update to get new companies and address changes
    console.log("📊 Step 1: Collecting new companies and address changes...");
    const incrementalResult = await dailyIncrementalService.runDailyUpdate();

    // Step 2: Analyze what we found
    const addressMovementsDetected = await analyzeNewAddressMovements();

    // Step 3: Clean up any synthetic data (safety measure)
    const cleanupResult = await cleanupSyntheticData();

    const totalTime = Date.now() - startTime;

    console.log("✅ Address Movement Update Cron Job completed!");
    console.log(`📊 New companies: ${incrementalResult.totalNewEntities}`);
    console.log(
      `🔄 Updated companies: ${incrementalResult.totalUpdatedEntities}`
    );
    console.log(
      `🏠 Real address movements detected: ${addressMovementsDetected.realMovements}`
    );
    console.log(
      `🧹 Synthetic records cleaned: ${cleanupResult.recordsCleaned}`
    );
    console.log(`⏱️ Total time: ${(totalTime / 1000).toFixed(1)} seconds`);

    return NextResponse.json({
      success: true,
      message: "Address movement update completed successfully",
      results: {
        newCompanies: incrementalResult.totalNewEntities,
        updatedCompanies: incrementalResult.totalUpdatedEntities,
        realAddressMovements: addressMovementsDetected.realMovements,
        syntheticRecordsCleaned: cleanupResult.recordsCleaned,
        processingTime: `${(totalTime / 1000).toFixed(1)}s`,
      },
      incrementalStats: incrementalResult,
      addressAnalysis: addressMovementsDetected,
      cleanup: cleanupResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Address Movement Update Cron Job failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Address movement update failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Analyze newly collected address movements to identify real changes
 */
async function analyzeNewAddressMovements(): Promise<{
  realMovements: number;
  companiesWithHistory: number;
  totalAddressRecords: number;
}> {
  try {
    // Count companies that have multiple address records (real movements)
    const companiesWithMultipleAddresses = await prisma.company.count({
      where: {
        addressHistory: {
          some: {
            AND: [
              { isCurrentAddress: false }, // Has previous addresses
              { toDate: { not: null } }, // With end dates
            ],
          },
        },
      },
    });

    // Count total real address movements (where toDate exists = real change)
    const realAddressMovements = await prisma.companyAddressHistory.count({
      where: {
        toDate: { not: null }, // Real movements have end dates
      },
    });

    // Count total address records
    const totalAddressRecords = await prisma.companyAddressHistory.count();

    console.log(`📊 Address Movement Analysis:`);
    console.log(
      `   - Companies with real movements: ${companiesWithMultipleAddresses}`
    );
    console.log(`   - Total real address changes: ${realAddressMovements}`);
    console.log(`   - Total address records: ${totalAddressRecords}`);

    return {
      realMovements: realAddressMovements,
      companiesWithHistory: companiesWithMultipleAddresses,
      totalAddressRecords,
    };
  } catch (error) {
    console.error("❌ Failed to analyze address movements:", error);
    return {
      realMovements: 0,
      companiesWithHistory: 0,
      totalAddressRecords: 0,
    };
  }
}

/**
 * Clean up any synthetic data that might have been created
 * This ensures we only have REAL data in the system
 */
async function cleanupSyntheticData(): Promise<{
  recordsCleaned: number;
  details: string[];
}> {
  try {
    const details: string[] = [];
    let totalCleaned = 0;

    // Remove any address history records that look synthetic
    const syntheticAddressRecords =
      await prisma.companyAddressHistory.deleteMany({
        where: {
          OR: [
            { address: { contains: "Previous address (unknown)" } },
            { address: { contains: "Unknown location" } },
            { city: "Unknown location" },
            { kommuneName: "Unknown" },
          ],
        },
      });

    if (syntheticAddressRecords.count > 0) {
      details.push(
        `Removed ${syntheticAddressRecords.count} synthetic address records`
      );
      totalCleaned += syntheticAddressRecords.count;
    }

    // Log cleanup results
    if (totalCleaned > 0) {
      console.log(
        `🧹 Cleanup completed: ${totalCleaned} synthetic records removed`
      );
      details.forEach((detail) => console.log(`   - ${detail}`));
    } else {
      console.log(`✅ No synthetic data found - system is clean`);
    }

    return {
      recordsCleaned: totalCleaned,
      details,
    };
  } catch (error) {
    console.error("❌ Failed to clean synthetic data:", error);
    return {
      recordsCleaned: 0,
      details: [
        `Error during cleanup: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
    };
  }
}

// Also support POST for manual triggers
export async function POST(request: NextRequest) {
  return GET(request);
}
