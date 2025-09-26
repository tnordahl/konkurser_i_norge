import { NextRequest, NextResponse } from "next/server";
import { updateAllKommunerData } from "@/lib/data-fetcher";
import { dailyIncrementalService } from "@/lib/daily-incremental-service";
import { prisma } from "@/lib/database";

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
    console.log("🔄 Starting Vercel cron job: comprehensive daily update");

    const startTime = Date.now();
    
    // Step 1: Update bankruptcy data
    console.log("📊 Step 1: Updating bankruptcy data...");
    const bankruptcyResult = await updateAllKommunerData();
    
    // Step 2: Run incremental update for new companies and address changes
    console.log("📊 Step 2: Collecting new companies and address changes...");
    const incrementalResult = await dailyIncrementalService.runDailyUpdate();

    // Step 3: Analyze address movements
    console.log("📊 Step 3: Analyzing address movements...");
    const addressMovementsDetected = await analyzeNewAddressMovements();

    // Step 4: Clean up synthetic data
    console.log("📊 Step 4: Cleaning up synthetic data...");
    const cleanupResult = await cleanupSyntheticData();

    const duration = Date.now() - startTime;

    console.log(`✅ Comprehensive daily update completed in ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: "Comprehensive daily update completed successfully",
      duration: `${duration}ms`,
      bankruptcyUpdate: bankruptcyResult,
      incrementalUpdate: {
        newCompanies: incrementalResult.totalNewEntities,
        updatedCompanies: incrementalResult.totalUpdatedEntities,
      },
      addressMovements: {
        realMovements: addressMovementsDetected.realMovements,
        companiesWithHistory: addressMovementsDetected.companiesWithHistory,
      },
      cleanup: {
        recordsCleaned: cleanupResult.recordsCleaned,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Vercel cron job failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Daily update failed",
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
