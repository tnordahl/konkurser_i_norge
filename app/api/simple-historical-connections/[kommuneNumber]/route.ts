import { NextRequest, NextResponse } from "next/server";
import { getBankruptciesForKommune } from "@/lib/database";
import {
  ErrorLogger,
  ErrorResponse,
  SuccessResponse,
} from "@/lib/config/error-handling";
import { InputValidator } from "@/lib/config/validation";

/**
 * Simplified Historical Connections API
 * Uses existing bankruptcy data to show fraud patterns
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  // Validate input
  const validation = InputValidator.validateKommuneNumber(kommuneNumber);
  if (!validation.isValid) {
    return ErrorResponse.validation("Invalid kommune number", {
      errors: validation.errors,
    });
  }

  try {
    console.log(
      `🔍 Finding simple historical connections for kommune ${kommuneNumber}...`
    );

    // Get existing bankruptcy data
    const bankruptcies = await getBankruptciesForKommune(kommuneNumber);

    // Analyze the bankruptcy data for patterns
    const currentBankruptcies = bankruptcies.filter(
      (b) =>
        b.companyName.includes("KONKURSBO") ||
        b.companyName.includes("TVANGSAVVIKLINGSBO")
    );
    const suspiciousCompanies = bankruptcies.filter(
      (b) =>
        b.hasRecentAddressChange ||
        b.isShellCompanySuspicious ||
        (b.lifespanInDays && b.lifespanInDays < 365)
    );

    // Create alerts based on existing data
    const alerts = [];

    if (suspiciousCompanies.length > 0) {
      alerts.push(
        `🚨 CRITICAL: ${suspiciousCompanies.length} companies with suspicious patterns detected!`
      );
    }

    if (currentBankruptcies.length > 0) {
      alerts.push(
        `🔴 ${currentBankruptcies.length} bankruptcy estates in kommune ${kommuneNumber}`
      );
    }

    // Check for address change patterns
    const addressChangeCompanies = bankruptcies.filter(
      (b) => b.hasRecentAddressChange
    );
    if (addressChangeCompanies.length > 0) {
      alerts.push(
        `📍 ${addressChangeCompanies.length} companies moved addresses before bankruptcy`
      );
    }

    if (alerts.length === 0) {
      alerts.push(
        `✅ No obvious fraud patterns detected in existing data for kommune ${kommuneNumber}`
      );
    }

    const stats = {
      totalBankruptcies: bankruptcies.length,
      suspiciousPatterns: suspiciousCompanies.length,
      addressChanges: addressChangeCompanies.length,
      konkursboEntities: currentBankruptcies.length,
    };

    console.log(`✅ Simple analysis complete for kommune ${kommuneNumber}:`);
    console.log(`   💼 Total bankruptcies: ${stats.totalBankruptcies}`);
    console.log(`   🚨 Suspicious patterns: ${stats.suspiciousPatterns}`);
    console.log(`   📍 Address changes: ${stats.addressChanges}`);

    return SuccessResponse.ok({
      kommuneNumber,
      kommuneName: `Kommune ${kommuneNumber}`,
      statistics: stats,
      data: {
        suspiciousCompanies: suspiciousCompanies.map(
          formatBankruptcyForDisplay
        ),
        addressChangeCompanies: addressChangeCompanies.map(
          formatBankruptcyForDisplay
        ),
        allBankruptcies: bankruptcies.map(formatBankruptcyForDisplay),
      },
      alerts,
      note: "This is a simplified analysis based on existing bankruptcy data. Click 'Oppdater selskaper' to enable full company scanning.",
    });
  } catch (error) {
    ErrorLogger.log(
      error as Error,
      `SIMPLE_HISTORICAL_CONNECTIONS_API_${kommuneNumber}`,
      {
        kommuneNumber,
      }
    );
    return ErrorResponse.apiError(
      `Failed to get simple historical connections for kommune ${kommuneNumber}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Format bankruptcy data for display
 */
function formatBankruptcyForDisplay(bankruptcy: any) {
  return {
    id: bankruptcy.id,
    organizationNumber: bankruptcy.organizationNumber,
    name: bankruptcy.companyName,
    bankruptcyDate: bankruptcy.bankruptcyDate,
    address: bankruptcy.address,
    industry: bankruptcy.industry,
    hasRecentAddressChange: bankruptcy.hasRecentAddressChange,
    isShellCompanySuspicious: bankruptcy.isShellCompanySuspicious,
    lifespanInDays: bankruptcy.lifespanInDays,
    riskScore: bankruptcy.isShellCompanySuspicious
      ? 85
      : bankruptcy.hasRecentAddressChange
        ? 70
        : 30,
    originalCompany: bankruptcy.originalCompany,
    konkursbo: bankruptcy.konkursbo,
    riskAlerts: [
      ...(bankruptcy.hasRecentAddressChange
        ? [
            {
              title: "⚠️ Address Change Alert",
              description: "Company changed address before bankruptcy",
              riskLevel: "HIGH",
            },
          ]
        : []),
      ...(bankruptcy.isShellCompanySuspicious
        ? [
            {
              title: "🚨 Shell Company Alert",
              description: `Short lifespan: ${bankruptcy.lifespanInDays} days`,
              riskLevel: "CRITICAL",
            },
          ]
        : []),
    ],
  };
}
