import { NextRequest, NextResponse } from "next/server";
import { performanceService } from "@/lib/performance-optimized-service";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const timeframe = parseInt(searchParams.get("timeframe") || "365");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const riskLevel = searchParams.get("riskLevel") || "all";

    const { kommuneNumber } = params;

    console.log(
      `🔍 Enhanced address movement analysis for kommune ${kommuneNumber}`
    );
    console.log(`📅 Timeframe: ${timeframe} days`);
    console.log(`📊 Page: ${page}, Limit: ${limit}`);

    // Get movement summary (cached)
    const summary = await performanceService.getAddressMovementSummary(
      kommuneNumber,
      timeframe
    );

    // Get detailed movements with pagination
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeframe);

    const skip = (page - 1) * limit;

    // Build where clause for risk filtering
    let riskWhere: any = {};
    if (riskLevel === "high") {
      riskWhere.riskScore = { gte: 70 };
    } else if (riskLevel === "medium") {
      riskWhere.riskScore = { gte: 30, lt: 70 };
    } else if (riskLevel === "low") {
      riskWhere.riskScore = { lt: 30 };
    }

    // Get companies with address movements
    const companiesWithMovements = await prisma.company.findMany({
      where: {
        ...riskWhere,
        OR: [
          { currentKommuneNumber: kommuneNumber },
          {
            addressHistory: {
              some: {
                kommuneNumber: kommuneNumber,
                createdAt: { gte: cutoffDate },
              },
            },
          },
        ],
        addressHistory: {
          some: {
            createdAt: { gte: cutoffDate },
          },
        },
      },
      include: {
        addressHistory: {
          where: {
            createdAt: { gte: cutoffDate },
          },
          orderBy: { createdAt: "desc" },
          take: 10, // Limit history per company for performance
        },
      },
      skip,
      take: limit,
      orderBy: [{ lastUpdated: "desc" }],
    });

    // Get total count for pagination
    const totalCount = await prisma.company.count({
      where: {
        ...riskWhere,
        OR: [
          { currentKommuneNumber: kommuneNumber },
          {
            addressHistory: {
              some: {
                kommuneNumber: kommuneNumber,
                createdAt: { gte: cutoffDate },
              },
            },
          },
        ],
        addressHistory: {
          some: {
            createdAt: { gte: cutoffDate },
          },
        },
      },
    });

    // Process movement patterns
    const movementPatterns = [];
    const outOfKommune = [];
    const intoKommune = [];
    const withinKommune = [];

    for (const company of companiesWithMovements) {
      const history = company.addressHistory;
      if (history.length < 2) continue;

      for (let i = 0; i < history.length - 1; i++) {
        const current = history[i];
        const previous = history[i + 1];

        // Skip identical addresses
        if (areAddressesIdentical(current, previous)) continue;

        const daysBetween = Math.abs(
          (current.createdAt.getTime() - previous.createdAt.getTime()) /
            (1000 * 60 * 60 * 24)
        );

        const pattern = {
          company: {
            organizationNumber: company.organizationNumber,
            name: company.name,
            organizationForm: company.organizationForm,
          },
          movement: {
            from: {
              address: previous.address,
              postalCode: previous.postalCode,
              city: previous.city,
              kommuneNumber: previous.kommuneNumber,
              date: previous.createdAt,
            },
            to: {
              address: current.address,
              postalCode: current.postalCode,
              city: current.city,
              kommuneNumber: current.kommuneNumber,
              date: current.createdAt,
            },
            daysBetween: Math.round(daysBetween),
            riskLevel: calculateMovementRisk(daysBetween, 0),
          },
        };

        movementPatterns.push(pattern);

        // Categorize movements
        if (
          previous.kommuneNumber === kommuneNumber &&
          current.kommuneNumber !== kommuneNumber
        ) {
          outOfKommune.push(pattern);
        } else if (
          previous.kommuneNumber !== kommuneNumber &&
          current.kommuneNumber === kommuneNumber
        ) {
          intoKommune.push(pattern);
        } else if (
          previous.kommuneNumber === kommuneNumber &&
          current.kommuneNumber === kommuneNumber
        ) {
          withinKommune.push(pattern);
        }
      }
    }

    // Get kommune name
    const kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
      select: { name: true },
    });

    const response = {
      success: true,
      kommuneNumber,
      kommuneName: kommune?.name || `Kommune ${kommuneNumber}`,
      timeframeDays: timeframe,
      summary,
      movements: {
        total: movementPatterns.length,
        outOfKommune: outOfKommune.length,
        intoKommune: intoKommune.length,
        withinKommune: withinKommune.length,
        patterns: movementPatterns,
      },
      categorized: {
        outOfKommune: outOfKommune.slice(0, 20), // Limit for performance
        intoKommune: intoKommune.slice(0, 20),
        withinKommune: withinKommune.slice(0, 20),
      },
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasNext: page < Math.ceil(totalCount / limit),
        hasPrev: page > 1,
      },
      performance: {
        companiesAnalyzed: companiesWithMovements.length,
        movementsFound: movementPatterns.length,
        cacheHit: false, // This could be enhanced with caching
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error in enhanced address movement analysis:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

function areAddressesIdentical(addr1: any, addr2: any): boolean {
  return (
    addr1.address === addr2.address &&
    addr1.postalCode === addr2.postalCode &&
    addr1.city === addr2.city &&
    addr1.kommuneNumber === addr2.kommuneNumber
  );
}

function calculateMovementRisk(
  daysBetween: number,
  companyRiskScore: number
): string {
  if (daysBetween === 0) return "data_correction";
  if (daysBetween < 7) return "extremely_high";
  if (daysBetween < 30) return "high";
  if (daysBetween < 90) return "medium";
  if (companyRiskScore > 70) return "high";
  return "low";
}
