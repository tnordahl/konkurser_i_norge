import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Frontend Test API - Test data for frontend display
 */

export async function GET(request: NextRequest) {
  try {
    // Get the data that the frontend should be displaying
    const kommuner = await prisma.kommune.findMany({
      select: {
        kommuneNumber: true,
        name: true,
        county: true,
        region: true,
        priority: true,
        _count: {
          select: {
            postalCodes: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    // Get company counts by matching city names
    const kommunerWithCounts = await Promise.all(
      kommuner.map(async (kommune) => {
        const companyCount = await prisma.company.count({
          where: {
            currentCity: { contains: kommune.name, mode: "insensitive" },
          },
        });

        return {
          ...kommune,
          companyCount,
          hasData: companyCount > 0,
          dataQuality:
            companyCount > 0
              ? kommune._count.postalCodes > 0
                ? "excellent"
                : "good"
              : "none",
        };
      })
    );

    // Get sample companies for verification
    const risorCompanies = await prisma.company.findMany({
      where: {
        currentCity: { contains: "Risør", mode: "insensitive" },
      },
      select: {
        name: true,
        organizationNumber: true,
        currentAddress: true,
        currentCity: true,
      },
      take: 3,
    });

    return NextResponse.json({
      success: true,
      test: "Frontend Data Test",
      kommuner: kommunerWithCounts,
      summary: {
        totalKommuner: kommuner.length,
        kommunerWithData: kommunerWithCounts.filter((k) => k.hasData).length,
        totalCompanies: kommunerWithCounts.reduce(
          (sum, k) => sum + k.companyCount,
          0
        ),
      },
      risorSample: risorCompanies,
      frontendStatus: {
        countyFixed: kommunerWithCounts.filter(
          (k) => k.county !== "Unknown" && k.county !== "Test County"
        ).length,
        risorData: kommunerWithCounts.find((k) => k.name === "Risør"),
        kristiansandData: kommunerWithCounts.find(
          (k) => k.name === "Kristiansand"
        ),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Frontend test failed:", error);
    return NextResponse.json(
      { success: false, error: "Frontend test failed" },
      { status: 500 }
    );
  }
}
