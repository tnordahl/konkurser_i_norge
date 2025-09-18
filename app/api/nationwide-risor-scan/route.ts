import { NextRequest, NextResponse } from "next/server";
import {
  scanNationwideForRisørConnections,
  findCompaniesMovedFromRisør,
} from "@/lib/nationwide-risor-scanner";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const scanType = searchParams.get("type") || "moved"; // "all" or "moved"

  console.log(`🇳🇴 Starting nationwide Risør scan (type: ${scanType})...`);

  try {
    let results;
    let description;

    if (scanType === "all") {
      results = await scanNationwideForRisørConnections();
      description = "All companies in Norway with any Risør connection";
    } else {
      results = await findCompaniesMovedFromRisør();
      description = "Companies that appear to have moved FROM Risør";
    }

    // Categorize results by connection type
    const categorized = {
      currentInRisor: results.filter(
        (r) => r.connectionType === "CURRENT_ADDRESS"
      ),
      postalConnections: results.filter(
        (r) => r.connectionType === "POSTAL_ADDRESS"
      ),
      nameConnections: results.filter(
        (r) => r.connectionType === "COMPANY_NAME"
      ),
      historicalIndicators: results.filter(
        (r) => r.connectionType === "HISTORICAL_INDICATOR"
      ),
    };

    // Risk level summary
    const riskSummary = {
      critical: results.filter((r) => r.riskScore >= 80).length,
      high: results.filter((r) => r.riskScore >= 60 && r.riskScore < 80).length,
      medium: results.filter((r) => r.riskScore >= 40 && r.riskScore < 60)
        .length,
      low: results.filter((r) => r.riskScore < 40).length,
    };

    console.log(`✅ Nationwide Risør scan complete:`);
    console.log(`   📊 Total connections found: ${results.length}`);
    console.log(`   🚨 Critical risk: ${riskSummary.critical}`);
    console.log(`   ⚠️  High risk: ${riskSummary.high}`);
    console.log(`   📋 Medium risk: ${riskSummary.medium}`);

    return NextResponse.json({
      success: true,
      scanType,
      description,
      summary: {
        totalConnections: results.length,
        riskDistribution: riskSummary,
        connectionTypes: {
          current: categorized.currentInRisor.length,
          postal: categorized.postalConnections.length,
          name: categorized.nameConnections.length,
          historical: categorized.historicalIndicators.length,
        },
      },
      data: {
        all: results,
        categorized,
      },
    });
  } catch (error) {
    console.error("Nationwide Risør scan failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Nationwide scan failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
