import { NextRequest, NextResponse } from "next/server";
import { postalCodeService } from "@/lib/postal-code-service";
import { enhancedAddressDetector } from "@/lib/enhanced-address-detector";
import { prisma } from "@/lib/database";

/**
 * Postal Codes Test API
 *
 * Tests the enhanced postal code collection and address change detection
 */

export async function POST(request: NextRequest) {
  try {
    const { action, kommuneNumber } = await request.json();

    console.log(
      `🧪 POSTAL CODES TEST: ${action} for kommune ${kommuneNumber || "all"}...`
    );
    const startTime = Date.now();

    let results: any = {};

    switch (action) {
      case "collect-risor":
        // Test postal code collection for Risør
        results = await testRisorPostalCodes();
        break;

      case "collect-all":
        // Collect postal codes for all kommuner
        results = await testAllPostalCodes();
        break;

      case "test-address-detection":
        // Test enhanced address change detection
        results = await testAddressDetection(kommuneNumber);
        break;

      case "analyze-coverage":
        // Analyze postal code coverage
        results = await analyzePostalCodeCoverage();
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      action,
      results,
      processingTime: `${totalTime}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Postal codes test failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Test failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function testRisorPostalCodes() {
  console.log("📮 Testing postal code collection for Risør...");

  const risorKommuneNumber = "4201";

  // Collect postal codes
  const postalCodes =
    await postalCodeService.collectPostalCodesForKommune(risorKommuneNumber);

  // Get stored postal codes
  const storedCodes =
    await postalCodeService.getPostalCodesForKommune(risorKommuneNumber);

  // Get some sample companies from Risør
  const sampleCompanies = await prisma.company.findMany({
    where: {
      OR: [
        { currentCity: { contains: "Risør", mode: "insensitive" } },
        {
          businessAddress: {
            path: ["kommunenummer"],
            equals: risorKommuneNumber,
          },
        },
      ],
    },
    take: 3,
    select: {
      organizationNumber: true,
      name: true,
      currentAddress: true,
      currentPostalCode: true,
      businessAddress: true,
      postalAddress: true,
    },
  });

  return {
    kommuneNumber: risorKommuneNumber,
    kommuneName: "Risør",
    postalCodesCollected: postalCodes.length,
    postalCodesStored: storedCodes.length,
    postalCodes: storedCodes.slice(0, 10), // Show first 10
    sampleCompanies: sampleCompanies.map((company) => ({
      organizationNumber: company.organizationNumber,
      name: company.name,
      currentAddress: company.currentAddress,
      currentPostalCode: company.currentPostalCode,
      businessKommune: (company.businessAddress as any)?.kommunenummer,
      postalKommune: (company.postalAddress as any)?.kommunenummer,
    })),
    insights: [
      `📊 Collected ${postalCodes.length} postal codes for Risør`,
      `💾 Stored ${storedCodes.length} postal codes in database`,
      `🏢 Found ${sampleCompanies.length} sample companies`,
      postalCodes.length > 0
        ? "✅ Postal code collection is working!"
        : "❌ No postal codes collected",
    ],
  };
}

async function testAllPostalCodes() {
  console.log("📮 Testing postal code collection for all kommuner...");

  // Get initial stats
  const initialStats = await postalCodeService.getPostalCodeStats();

  // Collect postal codes for all kommuner
  await postalCodeService.collectAllPostalCodes();

  // Get final stats
  const finalStats = await postalCodeService.getPostalCodeStats();

  return {
    initialStats,
    finalStats,
    improvement: {
      newKommuner:
        finalStats.kommunerWithPostalCodes -
        initialStats.kommunerWithPostalCodes,
      newPostalCodes:
        finalStats.totalPostalCodes - initialStats.totalPostalCodes,
    },
    insights: [
      `📊 Processed ${finalStats.totalKommuner} total kommuner`,
      `📮 Collected postal codes for ${finalStats.kommunerWithPostalCodes} kommuner`,
      `🔢 Total postal codes: ${finalStats.totalPostalCodes}`,
      `📈 Average postal codes per kommune: ${finalStats.averagePostalCodesPerKommune}`,
    ],
  };
}

async function testAddressDetection(kommuneNumber?: string) {
  console.log(
    `🔍 Testing address change detection for kommune ${kommuneNumber || "all"}...`
  );

  // Get some companies with address history
  const companiesWithHistory = await prisma.company.findMany({
    where: {
      addressHistory: {
        some: {},
      },
      ...(kommuneNumber && {
        OR: [
          {
            businessAddress: { path: ["kommunenummer"], equals: kommuneNumber },
          },
          { postalAddress: { path: ["kommunenummer"], equals: kommuneNumber } },
        ],
      }),
    },
    take: 5,
    include: {
      addressHistory: {
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });

  const analysisResults = [];

  for (const company of companiesWithHistory) {
    try {
      const analysis = await enhancedAddressDetector.analyzeAddressChange({
        organizationNumber: company.organizationNumber,
        name: company.name,
        currentBusinessAddress: company.businessAddress,
        currentPostalAddress: company.postalAddress,
        registrationDate: company.registrationDate || undefined,
      });

      analysisResults.push({
        organizationNumber: company.organizationNumber,
        name: company.name,
        analysis,
        addressHistoryCount: company.addressHistory.length,
      });
    } catch (error) {
      console.error(`Failed to analyze ${company.organizationNumber}:`, error);
    }
  }

  // Get overall stats
  const stats =
    await enhancedAddressDetector.getAddressChangeStats(kommuneNumber);

  return {
    kommuneNumber: kommuneNumber || "all",
    companiesAnalyzed: analysisResults.length,
    analysisResults,
    overallStats: stats,
    insights: [
      `📊 Analyzed ${analysisResults.length} companies with address history`,
      `🏢 Total companies: ${stats.totalCompanies}`,
      `📍 Companies with address history: ${stats.companiesWithHistory}`,
      `🔄 Recent address changes: ${stats.recentChanges}`,
      `🚚 Kommune movements: ${stats.kommuneMovements}`,
      `📮 Postal code coverage: ${stats.postalCodeCoverage}`,
    ],
  };
}

async function analyzePostalCodeCoverage() {
  console.log("📊 Analyzing postal code coverage...");

  const stats = await postalCodeService.getPostalCodeStats();

  // Get top kommuner by postal code count
  const topKommuner = await prisma.kommunePostalCode.groupBy({
    by: ["kommuneNumber"],
    _count: {
      postalCode: true,
    },
    where: {
      isActive: true,
    },
    orderBy: {
      _count: {
        postalCode: "desc",
      },
    },
    take: 10,
  });

  // Get kommuner with companies but no postal codes
  const kommunerWithoutCodes = await prisma.kommune.findMany({
    where: {
      postalCodes: {
        none: {
          isActive: true,
        },
      },
      companies: {
        some: {},
      },
    },
    take: 10,
    select: {
      kommuneNumber: true,
      name: true,
      _count: {
        select: {
          companies: true,
        },
      },
    },
  });

  return {
    overallStats: stats,
    topKommunerByPostalCodes: topKommuner.map((k) => ({
      kommuneNumber: k.kommuneNumber,
      postalCodeCount: k._count.postalCode,
    })),
    kommunerNeedingPostalCodes: kommunerWithoutCodes.map((k) => ({
      kommuneNumber: k.kommuneNumber,
      name: k.name,
      companyCount: k._count.companies,
    })),
    coverage: {
      percentage:
        stats.totalKommuner > 0
          ? Math.round(
              (stats.kommunerWithPostalCodes / stats.totalKommuner) * 100
            )
          : 0,
      status:
        stats.kommunerWithPostalCodes > stats.totalKommuner * 0.8
          ? "EXCELLENT"
          : stats.kommunerWithPostalCodes > stats.totalKommuner * 0.5
            ? "GOOD"
            : "NEEDS_IMPROVEMENT",
    },
    insights: [
      `📊 ${stats.kommunerWithPostalCodes}/${stats.totalKommuner} kommuner have postal codes (${Math.round((stats.kommunerWithPostalCodes / stats.totalKommuner) * 100)}%)`,
      `📮 ${stats.totalPostalCodes} total postal codes collected`,
      `📈 ${stats.averagePostalCodesPerKommune} average postal codes per kommune`,
      `🎯 Top kommune has ${topKommuner[0]?._count.postalCode || 0} postal codes`,
      `⚠️ ${kommunerWithoutCodes.length} kommuner with companies but no postal codes`,
    ],
  };
}

export async function GET(request: NextRequest) {
  try {
    // Get current postal code statistics
    const stats = await postalCodeService.getPostalCodeStats();

    return NextResponse.json({
      success: true,
      currentStats: stats,
      availableActions: [
        "collect-risor - Test postal code collection for Risør",
        "collect-all - Collect postal codes for all kommuner",
        "test-address-detection - Test enhanced address change detection",
        "analyze-coverage - Analyze postal code coverage",
      ],
      usage: "POST with { action: 'collect-risor' } or other actions",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get postal codes status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get status" },
      { status: 500 }
    );
  }
}
