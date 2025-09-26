import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Relevant Companies API - Only companies with address history or fraud indicators
 *
 * GET /api/relevant-companies - Get companies with relevant data (address changes, risk factors)
 */

export async function GET(request: NextRequest) {
  try {
    console.log("🔍 Fetching companies with relevant data...");

    // Get companies with address history
    const companiesWithAddressHistory = await prisma.company.findMany({
      where: {
        addressHistory: {
          some: {}, // Has at least one address history record
        },
      },
      include: {
        addressHistory: {
          orderBy: { fromDate: "desc" },
        },
        riskAlerts: {
          where: { isActive: true },
        },
        currentKommune: {
          select: { name: true, kommuneNumber: true },
        },
      },
      orderBy: { lastUpdated: "desc" },
    });

    // Get companies with risk alerts (fraud indicators)
    const companiesWithRiskAlerts = await prisma.company.findMany({
      where: {
        riskAlerts: {
          some: { isActive: true },
        },
      },
      include: {
        addressHistory: {
          orderBy: { fromDate: "desc" },
        },
        riskAlerts: {
          where: { isActive: true },
        },
        currentKommune: {
          select: { name: true, kommuneNumber: true },
        },
      },
      orderBy: { lastUpdated: "desc" },
    });

    // Get companies that are bankrupt (relevant for fraud detection)
    const bankruptCompanies = await prisma.company.findMany({
      where: {
        status: "BANKRUPTCY",
      },
      include: {
        addressHistory: {
          orderBy: { fromDate: "desc" },
        },
        riskAlerts: {
          where: { isActive: true },
        },
        currentKommune: {
          select: { name: true, kommuneNumber: true },
        },
      },
      orderBy: { lastUpdated: "desc" },
    });

    // Get companies with high risk scores (>= 60)
    const highRiskCompanies = await prisma.company.findMany({
      where: {
        riskProfile: {
          riskScore: {
            gte: 60,
          },
        },
      },
      include: {
        addressHistory: {
          orderBy: { fromDate: "desc" },
        },
        riskAlerts: {
          where: { isActive: true },
        },
        currentKommune: {
          select: { name: true, kommuneNumber: true },
        },
      },
      orderBy: { lastUpdated: "desc" },
    });

    // Create unique set of relevant companies (avoid duplicates)
    const relevantCompanyIds = new Set();
    const relevantCompanies: any[] = [];

    // Add companies from all categories
    [
      ...companiesWithAddressHistory,
      ...companiesWithRiskAlerts,
      ...bankruptCompanies,
      ...highRiskCompanies,
    ].forEach((company) => {
      if (!relevantCompanyIds.has(company.id)) {
        relevantCompanyIds.add(company.id);
        relevantCompanies.push(company);
      }
    });

    // Sort by relevance (risk score + number of address changes + number of alerts)
    relevantCompanies.sort((a, b) => {
      const scoreA =
        a.riskScore +
        (a.addressHistory?.length || 0) * 10 +
        (a.riskAlerts?.length || 0) * 5;
      const scoreB =
        b.riskScore +
        (b.addressHistory?.length || 0) * 10 +
        (b.riskAlerts?.length || 0) * 5;
      return scoreB - scoreA;
    });

    // Statistics
    const stats = {
      totalRelevantCompanies: relevantCompanies.length,
      companiesWithAddressHistory: companiesWithAddressHistory.length,
      companiesWithRiskAlerts: companiesWithRiskAlerts.length,
      bankruptCompanies: bankruptCompanies.length,
      highRiskCompanies: highRiskCompanies.length,
      totalAddressHistoryRecords: await prisma.companyAddressHistory.count(),
      totalActiveRiskAlerts: await prisma.companyRiskAlert.count({
        where: { isActive: true },
      }),
    };

    // Format companies for display
    const formattedCompanies = relevantCompanies.map((company) => ({
      id: company.id,
      organizationNumber: company.organizationNumber,
      name: company.name,
      currentAddress: company.currentAddress,
      currentKommune: company.currentKommune?.name || "Ukjent",
      kommuneNumber: company.currentKommune?.kommuneNumber || "Ukjent",
      riskScore: company.riskScore,
      isBankrupt: company.isBankrupt,
      bankruptcyDate: company.bankruptcyDate,
      relevanceIndicators: {
        hasAddressHistory: (company.addressHistory?.length || 0) > 0,
        addressHistoryCount: company.addressHistory?.length || 0,
        hasRiskAlerts: (company.riskAlerts?.length || 0) > 0,
        activeRiskAlertsCount: company.riskAlerts?.length || 0,
        isHighRisk: company.riskProfile?.riskScore >= 60,
        isBankrupt: company.status === "BANKRUPTCY",
      },
      addressHistory: company.addressHistory?.slice(0, 3).map((addr: any) => ({
        address: addr.address,
        kommuneName: addr.kommuneName,
        kommuneNumber: addr.kommuneNumber,
        fromDate: addr.fromDate,
        toDate: addr.toDate,
        isCurrentAddress: addr.isCurrentAddress,
      })),
      riskAlerts: company.riskAlerts?.map((alert: any) => ({
        alertType: alert.alertType,
        riskLevel: alert.riskLevel,
        title: alert.title,
        description: alert.description,
        triggeredAt: alert.triggeredAt,
      })),
    }));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      statistics: stats,
      companies: formattedCompanies,
      explanation: {
        purpose:
          "This table contains only companies with RELEVANT data for fraud detection",
        relevanceCriteria: [
          "Companies with address history (moved between kommuner)",
          "Companies with active risk alerts",
          "Bankrupt companies (potential fraud cases)",
          "High-risk companies (risk score >= 60)",
        ],
        dataQuality:
          "All companies in this table have at least one fraud-relevant indicator",
      },
      metadata: {
        queryType: "relevant_companies_only",
        dataFreshness: "Live data",
        purposeBuilt: "Fraud detection and monitoring",
      },
    });
  } catch (error) {
    console.error("Relevant companies error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch relevant companies",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
