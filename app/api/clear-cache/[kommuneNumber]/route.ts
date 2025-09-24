import { NextRequest, NextResponse } from "next/server";
import { optimizedCompanyService } from "@/lib/optimized-company-service";
import { prisma } from "@/lib/database";

/**
 * Clear cache and invalid data for a kommune
 *
 * DELETE /api/clear-cache/[kommuneNumber] - Clear all cached data
 * POST /api/clear-cache/[kommuneNumber] - Clear specific types of data
 */

export async function DELETE(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  try {
    console.log(`🗑️ Clearing all cache for kommune ${kommuneNumber}...`);

    // Clear optimized service cache
    optimizedCompanyService.clearCache(kommuneNumber);

    // Clear invalid risk alerts (like FRISØR false positives)
    const deletedAlerts = await prisma.companyRiskAlert.deleteMany({
      where: {
        kommuneNumber: kommuneNumber,
        alertType: "HISTORICAL_CONNECTION",
        description: {
          contains: "Company name or address suggests connection",
        },
      },
    });

    console.log(`🗑️ Deleted ${deletedAlerts.count} invalid risk alerts`);

    // Clear companies that don't actually belong to this kommune
    const invalidCompanies = await prisma.company.findMany({
      where: {
        riskAlerts: {
          some: {
            kommuneNumber: kommuneNumber,
            alertType: "HISTORICAL_CONNECTION",
          },
        },
        NOT: {
          currentKommune: {
            kommuneNumber: kommuneNumber,
          },
        },
      },
      include: {
        riskAlerts: {
          where: {
            kommuneNumber: kommuneNumber,
          },
        },
      },
    });

    // Remove risk alerts for companies that don't actually belong to this kommune
    let cleanedConnections = 0;
    for (const company of invalidCompanies) {
      // Check if company name actually contains the kommune name with word boundaries
      const kommuneNames = getKommuneNames(kommuneNumber);
      const companyName = company.name.toLowerCase();

      const hasValidConnection = kommuneNames.some((name) => {
        const namePattern = new RegExp(`\\b${name.toLowerCase()}\\b`, "i");
        return namePattern.test(companyName);
      });

      if (!hasValidConnection) {
        // Remove invalid risk alerts
        await prisma.companyRiskAlert.deleteMany({
          where: {
            companyId: company.id,
            kommuneNumber: kommuneNumber,
            alertType: "HISTORICAL_CONNECTION",
          },
        });
        cleanedConnections++;
        console.log(`🧹 Cleaned invalid connection: ${company.name}`);
      }
    }

    return NextResponse.json({
      success: true,
      kommuneNumber,
      results: {
        cacheCleared: true,
        invalidAlertsDeleted: deletedAlerts.count,
        invalidConnectionsCleaned: cleanedConnections,
        totalInvalidCompaniesFound: invalidCompanies.length,
      },
      message: `Cache cleared and ${deletedAlerts.count + cleanedConnections} invalid entries removed for kommune ${kommuneNumber}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Clear cache error:", error);
    return NextResponse.json(
      {
        error: "Failed to clear cache",
        details: error instanceof Error ? error.message : "Unknown error",
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
    const body = await request.json();
    const { clearTypes = ["cache", "invalid_alerts"] } = body;

    const results: any = {};

    if (clearTypes.includes("cache")) {
      optimizedCompanyService.clearCache(kommuneNumber);
      results.cacheCleared = true;
    }

    if (clearTypes.includes("invalid_alerts")) {
      // Clear FRISØR false positives and similar issues
      const deletedAlerts = await prisma.companyRiskAlert.deleteMany({
        where: {
          kommuneNumber: kommuneNumber,
          alertType: "HISTORICAL_CONNECTION",
          OR: [
            {
              description: {
                contains: "Company name or address suggests connection",
              },
            },
            {
              metadata: {
                path: ["confidence"],
                equals: "LOW",
              },
            },
          ],
        },
      });
      results.invalidAlertsDeleted = deletedAlerts.count;
    }

    if (clearTypes.includes("all_connections")) {
      // Clear all historical connections for this kommune
      const deletedConnections = await prisma.companyRiskAlert.deleteMany({
        where: {
          kommuneNumber: kommuneNumber,
          alertType: "HISTORICAL_CONNECTION",
        },
      });
      results.allConnectionsDeleted = deletedConnections.count;
    }

    return NextResponse.json({
      success: true,
      kommuneNumber,
      clearTypes,
      results,
      message: `Selected data cleared for kommune ${kommuneNumber}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Selective clear cache error:", error);
    return NextResponse.json(
      {
        error: "Failed to clear selected cache",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper function to get kommune names (same as in other files)
function getKommuneNames(kommuneNumber: string): string[] {
  const kommuneNameMap: Record<string, string[]> = {
    "4201": ["Risør", "RISØR"],
    "0301": ["Oslo", "OSLO"],
    // Add more as needed
  };
  return kommuneNameMap[kommuneNumber] || [];
}
