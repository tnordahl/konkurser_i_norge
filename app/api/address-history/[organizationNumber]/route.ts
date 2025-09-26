import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Address History API - Get complete address history for a company
 *
 * Shows all previous and current addresses with date ranges
 * Critical for fraud detection and company movement tracking
 */

export async function GET(
  request: NextRequest,
  { params }: { params: { organizationNumber: string } }
) {
  try {
    const { organizationNumber } = params;

    if (!organizationNumber) {
      return NextResponse.json(
        { success: false, error: "Organization number is required" },
        { status: 400 }
      );
    }

    // Get company basic info
    const company = await prisma.company.findUnique({
      where: { organizationNumber },
      select: {
        id: true,
        organizationNumber: true,
        name: true,
        currentAddress: true,
        currentCity: true,
        currentPostalCode: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    // Get complete address history
    const addressHistory = await prisma.companyAddressHistory.findMany({
      where: { organizationNumber },
      orderBy: [{ fromDate: "desc" }, { addressType: "asc" }],
    });

    // Group by address type and analyze patterns
    const businessAddresses = addressHistory.filter(
      (h) => h.addressType === "business"
    );
    const postalAddresses = addressHistory.filter(
      (h) => h.addressType === "postal"
    );

    // Calculate address change frequency
    const addressChanges = businessAddresses.filter(
      (h) => !h.isCurrentAddress
    ).length;
    const firstAddress = businessAddresses[businessAddresses.length - 1];
    const daysSinceFirstAddress = firstAddress?.fromDate
      ? Math.floor(
          (Date.now() - firstAddress.fromDate.getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    const changeFrequency =
      daysSinceFirstAddress > 0
        ? Math.round((addressChanges / daysSinceFirstAddress) * 365 * 100) / 100
        : 0;

    // Detect suspicious patterns
    const suspiciousPatterns = [];

    if (addressChanges > 3) {
      suspiciousPatterns.push("High address change frequency");
    }

    if (changeFrequency > 2) {
      suspiciousPatterns.push(
        `Very frequent moves: ${changeFrequency} changes per year`
      );
    }

    // Check for recent moves (last 90 days)
    const recentMoves = addressHistory.filter((h) => {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      return h.fromDate && h.fromDate >= ninetyDaysAgo;
    });

    if (recentMoves.length > 0) {
      suspiciousPatterns.push("Recent address change detected");
    }

    // Check for cross-kommune moves
    const kommuneNumbers = Array.from(
      new Set(addressHistory.map((h) => h.kommuneNumber).filter(Boolean))
    );
    if (kommuneNumbers.length > 2) {
      suspiciousPatterns.push(
        `Multiple kommune moves: ${kommuneNumbers.length} different kommuner`
      );
    }

    return NextResponse.json({
      success: true,
      company: {
        organizationNumber: company.organizationNumber,
        name: company.name,
        currentAddress: company.currentAddress,
        currentCity: company.currentCity,
        currentPostalCode: company.currentPostalCode,
      },
      addressHistory: {
        total: addressHistory.length,
        businessAddresses: businessAddresses.length,
        postalAddresses: postalAddresses.length,
        addressChanges,
        changeFrequency: `${changeFrequency} changes per year`,
        addresses: addressHistory.map((h) => ({
          id: h.id,
          address: h.address,
          city: h.city,
          postalCode: h.postalCode,
          kommuneNumber: h.kommuneNumber,
          kommuneName: h.kommuneName,
          addressType: h.addressType,
          fromDate: h.fromDate,
          toDate: h.toDate,
          isCurrentAddress: h.isCurrentAddress,
          durationDays:
            h.fromDate && h.toDate
              ? Math.floor(
                  (h.toDate.getTime() - h.fromDate.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : h.fromDate
                ? Math.floor(
                    (Date.now() - h.fromDate.getTime()) / (1000 * 60 * 60 * 24)
                  )
                : null,
        })),
      },
      riskAnalysis: {
        suspiciousPatterns,
        riskLevel:
          suspiciousPatterns.length === 0
            ? "LOW"
            : suspiciousPatterns.length <= 2
              ? "MEDIUM"
              : "HIGH",
        kommuneMovements: kommuneNumbers.map((k) => k || "Unknown"),
        recentActivity: recentMoves.length > 0,
      },
      insights: [
        `Company has ${addressChanges} recorded address changes`,
        `Average ${changeFrequency} address changes per year`,
        `Present in ${kommuneNumbers.length} different kommuner`,
        recentMoves.length > 0
          ? `Recent address activity: ${recentMoves.length} changes in last 90 days`
          : "No recent address changes",
        suspiciousPatterns.length > 0
          ? `⚠️ ${suspiciousPatterns.length} suspicious patterns detected`
          : "✅ Normal address history pattern",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get address history:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to retrieve address history",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
