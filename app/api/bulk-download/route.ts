import { NextRequest, NextResponse } from "next/server";
import { bulkDataService } from "@/lib/bulk-data-service";

/**
 * Bulk Download API - Optimized data collection using Brønnøysundregistrene bulk downloads
 *
 * Based on official API documentation recommendations:
 * https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html
 *
 * POST /api/bulk-download - Start bulk download process
 * GET /api/bulk-download - Get download status
 */

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeSubEntities =
      searchParams.get("includeSubEntities") === "true";
    const includeRoles = searchParams.get("includeRoles") === "true";
    const format =
      (searchParams.get("format") as "json" | "csv" | "xlsx") || "json";

    console.log("🚀 BULK DOWNLOAD: Starting optimized bulk data collection...");
    console.log(
      `📋 Options: format=${format}, subEntities=${includeSubEntities}, roles=${includeRoles}`
    );

    const startTime = Date.now();

    const result = await bulkDataService.downloadCompleteDataset({
      format,
      includeSubEntities,
      includeRoles,
    });

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      message: "Bulk download completed successfully",
      result: {
        ...result,
        totalTime: `${totalTime}ms`,
        efficiency: {
          entitiesPerSecond: Math.round(
            result.totalEntities / (totalTime / 1000)
          ),
          downloadSpeed: `${Math.round(result.totalEntities / (result.downloadTime / 1000))} entities/sec`,
          processingSpeed: `${Math.round(result.processedEntities / (result.processingTime / 1000))} entities/sec`,
        },
      },
      recommendations: [
        "🎯 Bulk downloads are much more efficient than pagination",
        "📊 Consider scheduling bulk updates daily instead of real-time scanning",
        "🔄 Use incremental updates for specific kommuner between bulk updates",
        "💾 Cache bulk data locally to reduce API calls",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Bulk download failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Bulk download failed",
        message: error instanceof Error ? error.message : "Unknown error",
        recommendations: [
          "🔍 Check network connectivity to data.brreg.no",
          "⏱️ Verify API endpoints are accessible",
          "💾 Ensure sufficient disk space for bulk data",
          "🔄 Consider retry mechanism for failed downloads",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log("📊 Getting bulk download status...");

    const status = await bulkDataService.getDownloadStatus();

    return NextResponse.json({
      success: true,
      status,
      apiInfo: {
        recommendedApproach: "Bulk downloads instead of pagination",
        availableEndpoints: {
          entities:
            "https://data.brreg.no/enhetsregisteret/api/enheter/lastned",
          subEntities:
            "https://data.brreg.no/enhetsregisteret/api/underenheter/lastned",
          roles: "https://data.brreg.no/enhetsregisteret/api/roller/lastned",
        },
        documentation:
          "https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html",
      },
      currentApproachIssues: [
        "❌ Using pagination for large datasets (inefficient)",
        "❌ Multiple sequential API calls instead of bulk downloads",
        "❌ Not utilizing complete dataset download endpoints",
        "❌ Missing authentication for advanced features",
      ],
      improvements: [
        "✅ Switch to bulk dataset downloads",
        "✅ Use proper authentication for Fullmakttjenesten",
        "✅ Implement caching strategy for bulk data",
        "✅ Add sub-entities and roles data collection",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get bulk download status:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to get status",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
