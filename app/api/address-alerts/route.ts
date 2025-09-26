import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kommuneNumber = searchParams.get("kommune");
    const limit = parseInt(searchParams.get("limit") || "50");

    console.log(`🚨 Fetching address change alerts${kommuneNumber ? ` for kommune ${kommuneNumber}` : ' (all kommuner)'}...`);

    // Build where clause
    const whereClause: any = {
      hasRecentAddressChange: true,
    };

    if (kommuneNumber) {
      const kommune = await prisma.kommune.findUnique({
        where: { kommuneNumber },
        select: { id: true },
      });

      if (!kommune) {
        return NextResponse.json(
          {
            success: false,
            error: "Kommune not found",
            timestamp: new Date().toISOString(),
          },
          { status: 404 }
        );
      }

      whereClause.kommuneId = kommune.id;
    }

    // Fetch companies with address changes (fraud alerts)
    const addressAlerts = await prisma.bankruptcy.findMany({
      where: whereClause,
      take: limit,
      orderBy: {
        bankruptcyDate: "desc",
      },
      include: {
        kommune: {
          select: {
            name: true,
            kommuneNumber: true,
            county: true,
          },
        },
      },
    });

    const formattedAlerts = addressAlerts.map((b) => ({
      id: b.id,
      companyName: b.companyName,
      organizationNumber: b.organizationNumber,
      bankruptcyDate: b.bankruptcyDate.toISOString().split("T")[0],
      currentKommune: {
        name: b.kommune.name,
        kommuneNumber: b.kommune.kommuneNumber,
        county: b.kommune.county,
      },
      address: b.address,
      industry: b.industry,
      hasRecentAddressChange: b.hasRecentAddressChange,
      // previousAddresses not available in bankruptcy model
      alertLevel: "HIGH", // All address changes are high priority
      fraudRisk: "SUSPECTED_ADDRESS_MANIPULATION",
    }));

    console.log(`🚨 Found ${formattedAlerts.length} address change alerts (potential fraud cases)`);

    return NextResponse.json({
      success: true,
      data: formattedAlerts,
      count: formattedAlerts.length,
      alertType: "ADDRESS_CHANGE_BEFORE_BANKRUPTCY",
      description: "Companies that moved their address out of the kommune before declaring bankruptcy",
      fraudRiskLevel: formattedAlerts.length > 0 ? "HIGH" : "LOW",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to fetch address change alerts:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch address change alerts",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
