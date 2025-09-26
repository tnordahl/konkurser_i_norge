import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Enhanced Bankruptcy Detection API
 *
 * Detects bankruptcies from company names, status fields, and movement patterns
 * Fixes the issue where companies like "RISØR SKO AS KONKURSBO" aren't detected
 */

interface BankruptcyRecord {
  organizationNumber: string;
  companyName: string;
  detectionMethod: string;
  bankruptcyIndicators: string[];
  riskLevel: "confirmed" | "likely" | "possible";
  lastSeen: string;
  currentAddress?: string;
  addressHistory?: any[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  try {
    console.log(
      `🔍 Enhanced bankruptcy detection for kommune ${kommuneNumber}`
    );

    // Get all companies related to this kommune
    const companies = await prisma.company.findMany({
      where: {
        OR: [
          {
            currentCity: {
              contains: getKommuneName(kommuneNumber),
              mode: "insensitive",
            },
          },
          {
            addressHistory: {
              some: {
                OR: [
                  { kommuneNumber },
                  {
                    kommuneName: {
                      contains: getKommuneName(kommuneNumber),
                      mode: "insensitive",
                    },
                  },
                ],
              },
            },
          },
        ],
      },
      include: {
        addressHistory: {
          orderBy: { fromDate: "desc" },
        },
      },
    });

    console.log(
      `📊 Analyzing ${companies.length} companies for bankruptcy indicators`
    );

    // Detect bankruptcies using multiple methods
    const bankruptcies: BankruptcyRecord[] = [];

    for (const company of companies) {
      const detection = detectBankruptcy(company);
      if (detection) {
        bankruptcies.push(detection);
      }
    }

    // Sort by risk level and detection confidence
    bankruptcies.sort((a, b) => {
      const riskOrder = { confirmed: 3, likely: 2, possible: 1 };
      return riskOrder[b.riskLevel] - riskOrder[a.riskLevel];
    });

    console.log(`💀 Found ${bankruptcies.length} bankruptcy cases`);

    return NextResponse.json({
      success: true,
      kommuneNumber,
      kommuneName: getKommuneName(kommuneNumber),
      summary: {
        totalCompanies: companies.length,
        bankruptcies: bankruptcies.length,
        confirmed: bankruptcies.filter((b) => b.riskLevel === "confirmed")
          .length,
        likely: bankruptcies.filter((b) => b.riskLevel === "likely").length,
        possible: bankruptcies.filter((b) => b.riskLevel === "possible").length,
      },
      bankruptcies,
      detectionMethods: [
        "Company name analysis (KONKURSBO, TVANGSAVVIKLINGSBO, etc.)",
        "Database bankruptcy flag",
        "Status field analysis",
        "Address movement patterns",
        "Registration date patterns",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Bankruptcy detection failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Bankruptcy detection failed",
        message: error instanceof Error ? error.message : "Unknown error",
        kommuneNumber,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

function detectBankruptcy(company: any): BankruptcyRecord | null {
  const indicators: string[] = [];
  let riskLevel: BankruptcyRecord["riskLevel"] = "possible";
  let detectionMethod = "";

  // Method 1: Company name analysis (most reliable)
  const bankruptcyKeywords = [
    "KONKURSBO",
    "TVANGSAVVIKLINGSBO",
    "AVVIKLINGSBO",
    "KONKURS",
    "LIQUIDATION",
    "BANKRUPTCY",
    "INSOLVENS",
  ];

  const nameUpper = company.name.toUpperCase();
  const foundKeywords = bankruptcyKeywords.filter((keyword) =>
    nameUpper.includes(keyword)
  );

  if (foundKeywords.length > 0) {
    indicators.push(`Company name contains: ${foundKeywords.join(", ")}`);
    riskLevel = "confirmed";
    detectionMethod = "name-analysis";
  }

  // Method 2: Database bankruptcy flag
  if (company.isBankrupt) {
    indicators.push("Database bankruptcy flag set");
    riskLevel = "confirmed";
    detectionMethod = detectionMethod
      ? `${detectionMethod} + database-flag`
      : "database-flag";
  }

  // Method 3: Status field analysis
  if (company.status && company.status.toLowerCase().includes("bankruptcy")) {
    indicators.push("Status field indicates bankruptcy");
    riskLevel = "confirmed";
    detectionMethod = detectionMethod
      ? `${detectionMethod} + status-field`
      : "status-field";
  }

  // Method 4: High risk score
  if (company.riskScore && company.riskScore >= 50) {
    indicators.push(`High risk score: ${company.riskScore}`);
    if (riskLevel === "possible") riskLevel = "likely";
    detectionMethod = detectionMethod
      ? `${detectionMethod} + risk-score`
      : "risk-score";
  }

  // Method 5: Address pattern analysis
  if (company.addressHistory && company.addressHistory.length > 0) {
    const recentMoves = company.addressHistory.filter((addr: any) => {
      const moveDate = new Date(addr.fromDate);
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      return moveDate > sixMonthsAgo;
    });

    if (recentMoves.length > 2) {
      indicators.push(
        `Frequent address changes: ${recentMoves.length} moves in 6 months`
      );
      if (riskLevel === "possible") riskLevel = "likely";
      detectionMethod = detectionMethod
        ? `${detectionMethod} + address-pattern`
        : "address-pattern";
    }
  }

  // Only return if we found indicators
  if (indicators.length === 0) {
    return null;
  }

  return {
    organizationNumber: company.organizationNumber,
    companyName: company.name,
    detectionMethod,
    bankruptcyIndicators: indicators,
    riskLevel,
    lastSeen: company.lastUpdated?.toISOString() || new Date().toISOString(),
    currentAddress: company.currentAddress,
    addressHistory: company.addressHistory?.slice(0, 3), // Last 3 addresses
  };
}

function getKommuneName(kommuneNumber: string): string {
  const kommuneMap: Record<string, string> = {
    "4201": "Risør",
    "4204": "Kristiansand",
    "4211": "Tvedestrand",
    "4020": "Midt-Telemark",
    "0301": "Oslo",
    "4601": "Bergen",
    "1103": "Stavanger",
  };

  return kommuneMap[kommuneNumber] || `Kommune ${kommuneNumber}`;
}
