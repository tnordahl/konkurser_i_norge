import { NextRequest, NextResponse } from "next/server";
import { ComprehensiveCompanyService } from "@/lib/comprehensive-company-service";
import {
  ErrorLogger,
  ErrorResponse,
  SuccessResponse,
} from "@/lib/config/error-handling";
import { InputValidator } from "@/lib/config/validation";

/**
 * API to get companies with historical connections to a kommune
 * This shows ALL companies that have ever had addresses in this kommune,
 * including those that moved out before going bankrupt (FRAUD DETECTION!)
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
      `🔍 Finding historical connections for kommune ${kommuneNumber}...`
    );

    const companyService = new ComprehensiveCompanyService();
    const connections =
      await companyService.getCompaniesWithHistoricalConnections(kommuneNumber);

    // Calculate risk statistics
    const stats = {
      currentCompanies: connections.currentCompanies.length,
      historicalConnections: connections.historicalConnections.length,
      bankruptcyAlerts: connections.bankruptcyAlerts.length,
      totalAlerts:
        connections.currentCompanies.reduce(
          (sum, c) => sum + c.riskAlerts.length,
          0
        ) +
        connections.historicalConnections.reduce(
          (sum, c) => sum + c.riskAlerts.length,
          0
        ) +
        connections.bankruptcyAlerts.reduce(
          (sum, c) => sum + c.riskAlerts.length,
          0
        ),
      criticalAlerts: [
        ...connections.currentCompanies,
        ...connections.historicalConnections,
        ...connections.bankruptcyAlerts,
      ].reduce(
        (sum, c) =>
          sum +
          c.riskAlerts.filter((alert: any) => alert.riskLevel === "CRITICAL")
            .length,
        0
      ),
    };

    console.log(
      `✅ Historical connections analysis complete for kommune ${kommuneNumber}:`
    );
    console.log(`   🏢 Current companies: ${stats.currentCompanies}`);
    console.log(`   📍 Historical connections: ${stats.historicalConnections}`);
    console.log(`   🚨 Bankruptcy alerts: ${stats.bankruptcyAlerts}`);
    console.log(`   ⚠️ Total alerts: ${stats.totalAlerts}`);
    console.log(`   🔴 Critical alerts: ${stats.criticalAlerts}`);

    return SuccessResponse.ok({
      kommuneNumber,
      kommuneName: `Kommune ${kommuneNumber}`,
      statistics: stats,
      data: {
        currentCompanies: connections.currentCompanies.map(
          formatCompanyForDisplay
        ),
        historicalConnections: connections.historicalConnections.map(
          formatCompanyForDisplay
        ),
        bankruptcyAlerts: connections.bankruptcyAlerts.map(
          formatCompanyForDisplay
        ),
      },
      alerts: generateAlertMessages(stats, kommuneNumber),
    });
  } catch (error) {
    ErrorLogger.log(
      error as Error,
      `HISTORICAL_CONNECTIONS_API_${kommuneNumber}`,
      {
        kommuneNumber,
      }
    );
    return ErrorResponse.apiError(
      `Failed to get historical connections for kommune ${kommuneNumber}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Update companies for a kommune (comprehensive scan)
 */
export async function POST(
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
      `🔄 Starting comprehensive company update for kommune ${kommuneNumber}...`
    );

    const companyService = new ComprehensiveCompanyService();
    const result =
      await companyService.updateAllCompaniesInKommune(kommuneNumber);

    console.log(
      `✅ Comprehensive update complete for kommune ${kommuneNumber}`
    );

    return SuccessResponse.ok({
      kommuneNumber,
      kommuneName: `Kommune ${kommuneNumber}`,
      updateResults: result,
      message: `Updated ${result.totalCompanies} companies, generated ${result.alertsGenerated} risk alerts`,
    });
  } catch (error) {
    ErrorLogger.log(
      error as Error,
      `COMPREHENSIVE_UPDATE_API_${kommuneNumber}`,
      {
        kommuneNumber,
      }
    );
    return ErrorResponse.apiError(
      `Failed to update companies for kommune ${kommuneNumber}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

/**
 * Format company data for display
 */
function formatCompanyForDisplay(company: any) {
  return {
    id: company.id,
    organizationNumber: company.organizationNumber,
    name: company.name,
    organizationForm: company.organizationForm,
    status: company.status,
    industry: company.industry,
    currentAddress: company.currentAddress,
    isBankrupt: company.isBankrupt,
    bankruptcyDate: company.bankruptcyDate?.toISOString().split("T")[0],
    riskScore: company.riskScore,
    isShellCompany: company.isShellCompany,
    lastUpdated: company.lastUpdated.toISOString().split("T")[0],
    addressHistory:
      company.addressHistory?.map((addr: any) => ({
        address: addr.address,
        kommuneNumber: addr.kommuneNumber,
        kommuneName: addr.kommuneName,
        fromDate: addr.fromDate?.toISOString().split("T")[0],
        toDate: addr.toDate?.toISOString().split("T")[0],
        addressType: addr.addressType,
        isCurrentAddress: addr.isCurrentAddress,
      })) || [],
    riskAlerts:
      company.riskAlerts?.map((alert: any) => ({
        id: alert.id,
        alertType: alert.alertType,
        riskLevel: alert.riskLevel,
        title: alert.title,
        description: alert.description,
        triggeredAt: alert.triggeredAt.toISOString().split("T")[0],
        metadata: alert.metadata,
      })) || [],
  };
}

/**
 * Generate alert messages based on statistics
 */
function generateAlertMessages(stats: any, kommuneNumber: string): string[] {
  const messages: string[] = [];

  if (stats.criticalAlerts > 0) {
    messages.push(
      `🚨 CRITICAL: ${stats.criticalAlerts} high-risk fraud patterns detected!`
    );
  }

  if (stats.bankruptcyAlerts > 0) {
    messages.push(
      `🔴 ${stats.bankruptcyAlerts} companies with bankruptcy connections to kommune ${kommuneNumber}`
    );
  }

  if (stats.historicalConnections > 0) {
    messages.push(
      `📍 ${stats.historicalConnections} companies previously had addresses in this kommune`
    );
  }

  if (stats.totalAlerts > 0) {
    messages.push(
      `⚠️ Total risk alerts: ${stats.totalAlerts} - Monitor these companies closely`
    );
  }

  if (messages.length === 0) {
    messages.push(
      `✅ No significant risk patterns detected for kommune ${kommuneNumber}`
    );
  }

  return messages;
}
