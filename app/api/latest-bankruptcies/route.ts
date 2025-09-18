import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");

    console.log(`🔍 Fetching latest ${limit} bankruptcies...`);

    const bankruptcies = await prisma.bankruptcy.findMany({
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

    const formattedBankruptcies = bankruptcies.map((b) => ({
      id: b.id,
      companyName: b.companyName,
      organizationNumber: b.organizationNumber,
      bankruptcyDate: b.bankruptcyDate.toISOString().split("T")[0],
      kommune: {
        name: b.kommune.name,
        kommuneNumber: b.kommune.kommuneNumber,
        county: b.kommune.county,
      },
      address: b.address,
      industry: b.industry,
      hasRecentAddressChange: b.hasRecentAddressChange,
    }));

    console.log(`✅ Found ${formattedBankruptcies.length} latest bankruptcies`);

    return NextResponse.json({
      success: true,
      data: formattedBankruptcies,
      count: formattedBankruptcies.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to fetch latest bankruptcies:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch latest bankruptcies",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
