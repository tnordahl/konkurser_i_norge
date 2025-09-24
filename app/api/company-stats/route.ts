import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Company Statistics API
 *
 * GET /api/company-stats - Get total company count and statistics
 */

export async function GET(request: NextRequest) {
  try {
    console.log("📊 Fetching company statistics...");

    // Get total company count
    const totalCompanies = await prisma.company.count();

    // Get companies by status
    const companiesByStatus = await prisma.company.groupBy({
      by: ["status"],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
    });

    // Get companies by organization form
    const companiesByOrgForm = await prisma.company.groupBy({
      by: ["organizationForm"],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 10, // Top 10 organization forms
    });

    // Get companies by kommune (top 10)
    const companiesByKommune = await prisma.company.groupBy({
      by: ["currentKommuneId"],
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
      take: 10,
    });

    // Get risk score distribution from RiskCompany model
    const riskScoreStats = await prisma.riskCompany.aggregate({
      _avg: {
        riskScore: true,
      },
      _max: {
        riskScore: true,
      },
      _min: {
        riskScore: true,
      },
    });

    // Get companies with high risk scores (>= 70)
    const highRiskCompanies = await prisma.riskCompany.count({
      where: {
        riskScore: {
          gte: 70,
        },
      },
    });

    // Get bankruptcy statistics (companies with status containing 'bankrupt')
    const bankruptCompanies = await prisma.company.count({
      where: {
        status: {
          contains: "Bankruptcy",
          mode: "insensitive",
        },
      },
    });

    // Get companies with active risk alerts
    const companiesWithAlerts = await prisma.company.count({
      where: {
        riskAlerts: {
          some: {
            isActive: true,
          },
        },
      },
    });

    // Get recent companies (added in last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCompanies = await prisma.company.count({
      where: {
        createdAt: {
          gte: thirtyDaysAgo,
        },
      },
    });

    // Get total risk alerts
    const totalRiskAlerts = await prisma.companyRiskAlert.count({
      where: {
        isActive: true,
      },
    });

    // Get risk alerts by type
    const alertsByType = await prisma.companyRiskAlert.groupBy({
      by: ["alertType"],
      where: {
        isActive: true,
      },
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: "desc",
        },
      },
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      statistics: {
        totalCompanies,
        bankruptCompanies,
        companiesWithAlerts,
        recentCompanies: recentCompanies,
        highRiskCompanies,
        totalRiskAlerts,
        riskScoreStats: {
          average: Math.round(riskScoreStats._avg.riskScore || 0),
          maximum: riskScoreStats._max.riskScore || 0,
          minimum: riskScoreStats._min.riskScore || 0,
        },
        breakdown: {
          byStatus: companiesByStatus.map((item) => ({
            status: item.status || "Unknown",
            count: item._count.id,
          })),
          byOrganizationForm: companiesByOrgForm.map((item) => ({
            organizationForm: item.organizationForm || "Unknown",
            count: item._count.id,
          })),
          byKommune: companiesByKommune.map((item) => ({
            kommuneId: item.currentKommuneId || "Unknown",
            count: item._count.id,
          })),
          alertsByType: alertsByType.map((item) => ({
            alertType: item.alertType,
            count: item._count.id,
          })),
        },
      },
      metadata: {
        databaseEngine: "PostgreSQL with Prisma",
        queryExecutionTime: "Real-time",
        dataFreshness: "Live data",
      },
    });
  } catch (error) {
    console.error("Company stats error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch company statistics",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
