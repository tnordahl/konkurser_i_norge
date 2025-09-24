import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Get all postal codes for a specific kommune
 * 
 * This endpoint retrieves all postal codes associated with a kommune
 * to enable postal code segmentation for large municipalities like Oslo
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  try {
    console.log(`📮 Getting all postal codes for kommune ${kommuneNumber}...`);

    // Get all postal codes for this kommune
    const postalCodes = await prisma.kommunePostalCode.findMany({
      where: {
        kommuneNumber: kommuneNumber,
        isActive: true,
      },
      select: {
        postalCode: true,
        city: true,
      },
      orderBy: {
        postalCode: 'asc',
      },
    });

    console.log(`✅ Found ${postalCodes.length} postal codes for kommune ${kommuneNumber}`);

    return NextResponse.json({
      success: true,
      kommuneNumber,
      totalPostalCodes: postalCodes.length,
      postalCodes: postalCodes,
      insights: [
        `📊 Total postal codes: ${postalCodes.length}`,
        `🏢 Ready for segmented collection`,
        postalCodes.length > 100 ? "⚠️ Large municipality - postal segmentation recommended" : "✅ Small municipality - single collection sufficient",
      ],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error(`❌ Failed to get postal codes for kommune ${kommuneNumber}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get postal codes",
        message: error instanceof Error ? error.message : "Unknown error",
        kommuneNumber,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
