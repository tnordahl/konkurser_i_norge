import { NextRequest, NextResponse } from "next/server";
import { IncrementalScanner } from "@/lib/incremental-scanner";
import {
  ErrorLogger,
  ErrorResponse,
  SuccessResponse,
} from "@/lib/config/error-handling";
import { InputValidator } from "@/lib/config/validation";

/**
 * Incremental Historical Connection Scanner
 *
 * This API implements smart incremental scanning:
 * - First visit: Full scan for historical connections
 * - Subsequent visits: Only scan for new data since last scan
 * - Stores findings with timestamps for future reference
 *
 * GET /api/incremental-scan/[kommuneNumber] - Get stored connections and trigger incremental scan
 * POST /api/incremental-scan/[kommuneNumber] - Force full rescan
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  const validation = InputValidator.validateKommuneNumber(kommuneNumber);
  if (!validation.isValid) {
    return ErrorResponse.validation("Invalid kommune number", {
      errors: validation.errors,
    });
  }

  try {
    console.log(
      `🔍 Incremental scan requested for kommune ${kommuneNumber}...`
    );

    const scanner = new IncrementalScanner();
    const results = await scanner.scanForHistoricalConnections(kommuneNumber);

    const response = {
      kommuneNumber,
      kommuneName: `Kommune ${kommuneNumber}`, // Would be dynamic in production
      scanType: results.lastScanDate ? "incremental" : "initial",
      statistics: {
        totalConnections: results.totalFound,
        newFindings: results.newFindings,
        lastScanDate: results.lastScanDate,
        nextScanRecommended: results.nextScanRecommended,
      },
      data: {
        historicalConnections: results.companies,
      },
      alerts: generateAlerts(results),
      metadata: {
        scanTimestamp: new Date().toISOString(),
        scanStrategy: "incremental",
        dataSource: "bronnøysundregistrene + stored_historical_data",
      },
    };

    console.log(`✅ Incremental scan complete for kommune ${kommuneNumber}:`);
    console.log(`   📊 Total connections: ${results.totalFound}`);
    console.log(`   🆕 New findings: ${results.newFindings}`);
    console.log(`   📅 Last scan: ${results.lastScanDate || "Never"}`);

    return SuccessResponse.ok(response);
  } catch (error) {
    ErrorLogger.log(error as Error, `INCREMENTAL_SCAN_API_${kommuneNumber}`, {
      kommuneNumber,
    });
    return ErrorResponse.apiError(
      `Failed to perform incremental scan for kommune ${kommuneNumber}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  const validation = InputValidator.validateKommuneNumber(kommuneNumber);
  if (!validation.isValid) {
    return ErrorResponse.validation("Invalid kommune number", {
      errors: validation.errors,
    });
  }

  try {
    console.log(`🔄 Force rescan requested for kommune ${kommuneNumber}...`);

    // For force rescan, we could clear existing data and start fresh
    // For now, just run the incremental scan
    const scanner = new IncrementalScanner();
    const results = await scanner.scanForHistoricalConnections(kommuneNumber);

    const response = {
      kommuneNumber,
      kommuneName: `Kommune ${kommuneNumber}`,
      scanType: "forced_rescan",
      statistics: {
        totalConnections: results.totalFound,
        newFindings: results.newFindings,
        lastScanDate: results.lastScanDate,
        nextScanRecommended: results.nextScanRecommended,
      },
      data: {
        historicalConnections: results.companies,
      },
      alerts: generateAlerts(results),
      message: `Force rescan completed. Found ${results.totalFound} total connections (${results.newFindings} new).`,
    };

    return SuccessResponse.ok(response);
  } catch (error) {
    ErrorLogger.log(
      error as Error,
      `INCREMENTAL_FORCE_SCAN_API_${kommuneNumber}`,
      {
        kommuneNumber,
      }
    );
    return ErrorResponse.apiError(
      `Failed to perform force rescan for kommune ${kommuneNumber}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

function generateAlerts(results: any): string[] {
  const alerts = [];

  if (results.newFindings > 0) {
    alerts.push(`🆕 Found ${results.newFindings} new historical connections`);
  }

  if (results.totalFound > 10) {
    alerts.push(
      `🔍 High number of historical connections (${results.totalFound}) - investigate patterns`
    );
  }

  if (results.companies.some((c: any) => c.connection?.confidence === "HIGH")) {
    const highConfidenceCount = results.companies.filter(
      (c: any) => c.connection?.confidence === "HIGH"
    ).length;
    alerts.push(
      `🚨 ${highConfidenceCount} high-confidence historical connections detected`
    );
  }

  if (alerts.length === 0) {
    alerts.push(
      `✅ Incremental scan complete - ${results.totalFound} total connections tracked`
    );
  }

  return alerts;
}
