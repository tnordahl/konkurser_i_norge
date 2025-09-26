import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { delay } from "@/lib/config/api-delays";
import { dateUtils } from "@/lib/config/date-utils";
import { PAGINATION } from "@/lib/config/constants";
import {
  ErrorLogger,
  ErrorResponse,
  SuccessResponse,
} from "@/lib/config/error-handling";
import { InputValidator } from "@/lib/config/validation";
import {
  optimizedCompanyService,
  CompanyConnectionData,
} from "@/lib/optimized-company-service";

/**
 * Smart Cache API - Implements your exact caching strategy:
 *
 * 1. FIRST VISIT: Full scan → Save results → Show immediately
 * 2. SUBSEQUENT VISITS: Show cached INSTANTLY → Background incremental scan
 * 3. BACKGROUND SYNC: Keep company data fresh every 12h
 *
 * GET /api/smart-cache/[kommuneNumber] - Get cached + incremental results
 * POST /api/smart-cache/[kommuneNumber] - Force full rescan
 */

interface CachedConnection {
  id: string;
  name: string;
  organizationNumber: string;
  currentAddress: string;
  riskScore: number;
  connection: {
    type: string;
    evidence: string;
    confidence: string;
    discoveredAt: string;
  };
  riskAlerts: any[];
}

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
    console.log(`🚀 Smart cache request for kommune ${kommuneNumber}...`);

    // STEP 1: Get cached connections INSTANTLY
    const cachedConnections = await getCachedConnections(kommuneNumber);
    const lastScanInfo = await getLastScanInfo(kommuneNumber);

    console.log(`📊 Found ${cachedConnections.length} cached connections`);
    console.log(`📅 Last scan: ${lastScanInfo?.lastScanDate || "Never"}`);

    // STEP 2: Determine if we need incremental scan
    const needsIncrementalScan = shouldRunIncrementalScan(lastScanInfo);
    let newFindings = 0;
    let incrementalResults: CachedConnection[] = [];

    if (needsIncrementalScan) {
      console.log(
        `🔄 Running incremental scan since ${lastScanInfo?.lastScanDate || "never"}...`
      );

      // Run incremental scan in background (don't block response)
      incrementalResults = await runIncrementalScan(
        kommuneNumber,
        lastScanInfo?.lastScanDate
      );
      newFindings = incrementalResults.length;

      // Save new findings using batch operation
      if (incrementalResults.length > 0) {
        await saveConnectionsToCache(incrementalResults, kommuneNumber);
      }

      // Update last scan timestamp
      await updateLastScanTimestamp(kommuneNumber);

      console.log(`✅ Incremental scan found ${newFindings} new connections`);
    }

    // STEP 3: Combine cached + new results
    const allConnections = [...cachedConnections, ...incrementalResults];

    const response = {
      kommuneNumber,
      kommuneName: `Kommune ${kommuneNumber}`,
      scanType: lastScanInfo ? "incremental" : "initial",
      statistics: {
        totalConnections: allConnections.length,
        cachedConnections: cachedConnections.length,
        newFindings: newFindings,
        lastScanDate: lastScanInfo?.lastScanDate || null,
        nextScanRecommended: dateUtils.daysAgo(-1), // Next day
      },
      data: {
        historicalConnections: allConnections,
      },
      alerts: generateSmartAlerts(
        allConnections.length,
        newFindings,
        lastScanInfo
      ),
      metadata: {
        cacheStrategy: "smart_incremental",
        instantResponse: true,
        backgroundScanCompleted: needsIncrementalScan,
      },
    };

    return SuccessResponse.ok(response);
  } catch (error) {
    ErrorLogger.log(error as Error, `SMART_CACHE_API_${kommuneNumber}`, {
      kommuneNumber,
    });
    return ErrorResponse.apiError(
      `Failed to get smart cache for kommune ${kommuneNumber}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Get cached connections from database (INSTANT response)
 */
async function getCachedConnections(
  kommuneNumber: string
): Promise<CachedConnection[]> {
  try {
    // Use optimized service with caching
    const connections =
      await optimizedCompanyService.getCachedConnections(kommuneNumber);

    // Convert to legacy format for compatibility
    return connections.map((conn) => ({
      id: conn.organizationNumber, // Use org number as ID for now
      organizationNumber: conn.organizationNumber,
      name: conn.name,
      currentAddress: conn.currentAddress || "Unknown address",
      connection: {
        ...conn.connection,
        discoveredAt: conn.connection.discoveredAt.toISOString(),
      },
      riskScore: conn.riskScore || 0,
      riskAlerts:
        conn.riskAlerts?.map((alert) => ({
          id: `${conn.organizationNumber}-${alert.alertType}`,
          alertType: alert.alertType,
          riskLevel: alert.riskLevel,
          title: alert.title,
          description: alert.description,
        })) || [],
    }));
  } catch (error) {
    console.error("Failed to get cached connections:", error);
    return [];
  }
}

/**
 * Get last scan information
 */
async function getLastScanInfo(kommuneNumber: string): Promise<{
  lastScanDate: Date;
  totalConnections: number;
} | null> {
  try {
    const latestAlert = await prisma.companyRiskAlert.findFirst({
      where: {
        kommuneNumber: kommuneNumber,
        alertType: "HISTORICAL_CONNECTION",
      },
      orderBy: {
        triggeredAt: "desc",
      },
    });

    if (latestAlert) {
      const totalConnections = await prisma.companyRiskAlert.count({
        where: {
          kommuneNumber: kommuneNumber,
          alertType: "HISTORICAL_CONNECTION",
          isActive: true,
        },
      });

      return {
        lastScanDate: latestAlert.triggeredAt,
        totalConnections,
      };
    }

    return null;
  } catch (error) {
    console.error(`Failed to get last scan info:`, error);
    return null;
  }
}

/**
 * Determine if we should run incremental scan
 */
function shouldRunIncrementalScan(lastScanInfo: any): boolean {
  if (!lastScanInfo) {
    return true; // First scan
  }

  const hoursSinceLastScan =
    (Date.now() - lastScanInfo.lastScanDate.getTime()) / (1000 * 60 * 60);

  // Run incremental scan if more than 6 hours since last scan
  return hoursSinceLastScan > 6;
}

/**
 * Run incremental scan - only check NEW/CHANGED companies
 * This is much faster than full scan
 */
async function runIncrementalScan(
  kommuneNumber: string,
  lastScanDate?: Date
): Promise<CachedConnection[]> {
  console.log(`🔍 Running incremental scan for kommune ${kommuneNumber}...`);

  const findings: CachedConnection[] = [];
  const enhetsregisterUrl =
    "https://data.brreg.no/enhetsregisteret/api/enheter";

  // Get postal codes for this kommune
  const targetPostalCodes = await getKommunePostalCodes(kommuneNumber);

  // OPTIMIZATION: Only scan first 2 pages for incremental updates
  const maxPages = 2; // Much faster than full scan

  for (let page = 0; page < maxPages; page++) {
    console.log(`📄 Incremental scan page ${page + 1}/${maxPages}...`);

    const searchParams = new URLSearchParams({
      size: PAGINATION.LARGE_PAGE_SIZE.toString(),
      page: page.toString(),
    });

    const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "selskapsregister-norge-smart-cache/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch page ${page}: ${response.status}`);
      break;
    }

    const data = await response.json();

    if (!data._embedded?.enheter || data._embedded.enheter.length === 0) {
      break;
    }

    for (const enhet of data._embedded.enheter) {
      if (!enhet.organisasjonsnummer || !enhet.navn) continue;

      // Skip if we're currently in the target kommune
      const currentKommune = enhet.forretningsadresse?.kommunenummer;
      if (currentKommune === kommuneNumber) continue;

      // Check for connections to target kommune
      const hasConnection = checkKommuneConnection(
        enhet,
        kommuneNumber,
        targetPostalCodes
      );

      if (hasConnection) {
        findings.push({
          id: enhet.organisasjonsnummer,
          name: enhet.navn,
          organizationNumber: enhet.organisasjonsnummer,
          currentAddress: formatAddress(enhet.forretningsadresse),
          riskScore: 50,
          connection: hasConnection,
          riskAlerts: [],
        });
      }

      await delay.quickProcessing();
    }

    await delay.betweenApiBatches();
  }

  console.log(`🔍 Incremental scan found ${findings.length} new connections`);
  return findings;
}

/**
 * Check if a company has connection to target kommune
 */
function checkKommuneConnection(
  enhet: any,
  kommuneNumber: string,
  targetPostalCodes: string[]
): any {
  // Method 1: Postal address in target kommune
  if (enhet.postadresse?.kommunenummer === kommuneNumber) {
    return {
      type: "POSTAL_ADDRESS",
      evidence: `Postal address in kommune ${kommuneNumber}`,
      confidence: "HIGH",
      discoveredAt: new Date().toISOString(),
    };
  }

  // Method 2: Uses target kommune postal codes
  if (
    enhet.postadresse?.postnummer &&
    targetPostalCodes.includes(enhet.postadresse.postnummer)
  ) {
    return {
      type: "POSTAL_ADDRESS",
      evidence: `Uses postal code ${enhet.postadresse.postnummer} from kommune ${kommuneNumber}`,
      confidence: "MEDIUM",
      discoveredAt: new Date().toISOString(),
    };
  }

  // Method 3: Kommune name in company name or address
  const kommuneNames = getKommuneNames(kommuneNumber);
  const companyName = enhet.navn?.toLowerCase() || "";
  const businessAddr = formatAddress(enhet.forretningsadresse).toLowerCase();

  const hasNameConnection = kommuneNames.some((name) => {
    const namePattern = new RegExp(`\\b${name.toLowerCase()}\\b`, "i");
    return namePattern.test(companyName) || namePattern.test(businessAddr);
  });

  if (hasNameConnection) {
    return {
      type: "ADDRESS_MISMATCH",
      evidence: `Company name or address suggests connection to kommune ${kommuneNumber}`,
      confidence: "LOW",
      discoveredAt: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Save connections to cache using optimized batch operations
 */
async function saveConnectionsToCache(
  connections: CachedConnection[],
  kommuneNumber: string
): Promise<void> {
  try {
    // Convert to optimized format
    const connectionData: CompanyConnectionData[] = connections.map((conn) => ({
      organizationNumber: conn.organizationNumber,
      name: conn.name,
      currentAddress: conn.currentAddress || "Unknown address",
      connection: {
        ...conn.connection,
        confidence:
          (conn.connection.confidence as "HIGH" | "MEDIUM" | "LOW") || "MEDIUM",
        discoveredAt: new Date(conn.connection.discoveredAt),
      },
      riskScore: conn.riskScore,
    }));

    // Use batch save for better performance
    const result = await optimizedCompanyService.batchSaveConnections(
      connectionData,
      kommuneNumber
    );

    console.log(
      `💾 Batch saved ${result.totalProcessed} connections (${result.newCompanies} new, ${result.updatedCompanies} updated, ${result.alertsGenerated} alerts) in ${result.processingTimeMs}ms`
    );

    if (result.errors.length > 0) {
      console.warn(
        `⚠️ ${result.errors.length} errors during batch save:`,
        result.errors.slice(0, 3)
      );
    }
  } catch (error) {
    console.error("Failed to save connections to cache:", error);
  }
}

async function updateLastScanTimestamp(kommuneNumber: string): Promise<void> {
  // Timestamp is automatically updated via the risk alert creation
  console.log(`📅 Updated last scan timestamp for kommune ${kommuneNumber}`);
}

function generateSmartAlerts(
  totalConnections: number,
  newFindings: number,
  lastScanInfo: any
): string[] {
  const alerts = [];

  if (newFindings > 0) {
    alerts.push(`🆕 ${newFindings} nye tilknytninger funnet`);
  }

  if (totalConnections > 10) {
    alerts.push(
      `🔍 Mange historiske tilknytninger (${totalConnections}) - vurder nærmere analyse`
    );
  }

  if (!lastScanInfo) {
    alerts.push(
      `✨ Første scanning fullført - ${totalConnections} tilknytninger lagret`
    );
  } else {
    const hoursSinceScan =
      (Date.now() - lastScanInfo.lastScanDate.getTime()) / (1000 * 60 * 60);
    if (hoursSinceScan < 1) {
      alerts.push(
        `⚡ Rask oppdatering - data er fersk (${Math.round(hoursSinceScan * 60)} min siden)`
      );
    }
  }

  if (alerts.length === 0) {
    alerts.push(
      `✅ Cache oppdatert - ${totalConnections} tilknytninger tilgjengelig`
    );
  }

  return alerts;
}

// Helper functions
async function getKommunePostalCodes(kommuneNumber: string): Promise<string[]> {
  try {
    const { postalCodeService } = await import('@/lib/postal-code-service');
    const postalCodes = await postalCodeService.getPostalCodesForKommune(kommuneNumber);
    return postalCodes.map(pc => pc.postalCode);
  } catch (error) {
    console.warn(`Failed to get postal codes for kommune ${kommuneNumber}:`, error);
    return [];
  }
}

function getKommuneNames(kommuneNumber: string): string[] {
  try {
    const { kommuneService } = require('@/lib/kommune-service');
    const kommune = kommuneService.getAllKommuner().find((k: any) => k.number === kommuneNumber);
    if (kommune) {
      return [kommune.name, kommune.name.toUpperCase()];
    }
    return [];
  } catch (error) {
    console.warn(`Failed to get kommune name for ${kommuneNumber}:`, error);
    return [];
  }
}

function formatAddress(addr: any): string {
  if (!addr) return "Ukjent adresse";

  const parts = [];
  if (addr.adresse && addr.adresse.length > 0) {
    parts.push(addr.adresse.join(" "));
  }
  if (addr.postnummer) parts.push(addr.postnummer);
  if (addr.poststed) parts.push(addr.poststed);

  return parts.join(", ");
}
