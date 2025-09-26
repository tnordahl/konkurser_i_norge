import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Organic Movement Detection
 *
 * Finds companies that have moved out of a kommune using multiple detection methods:
 * 1. Address history analysis
 * 2. Name pattern matching (hotels, restaurants, etc.)
 * 3. Cross-reference with current addresses
 * 4. Postal code analysis
 */

interface MovementResult {
  organizationNumber: string;
  name: string;
  previousAddress: string;
  currentAddress: string;
  previousKommune: string;
  currentKommune: string;
  detectionMethod: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  moveDate?: Date;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  try {
    const { kommuneNumber } = params;
    const { searchParams } = new URL(request.url);
    const includeAll = searchParams.get("includeAll") === "true";
    const nameFilter = searchParams.get("nameFilter") || "";

    console.log(
      `🔍 Starting organic movement detection for kommune ${kommuneNumber}`
    );

    // Get kommune info
    const kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
    });

    if (!kommune) {
      return NextResponse.json(
        {
          success: false,
          error: `Kommune ${kommuneNumber} not found`,
        },
        { status: 404 }
      );
    }

    const movements: MovementResult[] = [];

    // Method 1: Address History Analysis
    console.log("📊 Method 1: Analyzing address history...");
    const historyMovements = await findMovementsByAddressHistory(
      kommuneNumber,
      kommune.name
    );
    movements.push(...historyMovements);

    // Method 2: Name Pattern Analysis (hotels, restaurants, etc.)
    console.log("🏨 Method 2: Analyzing business name patterns...");
    const nameMovements = await findMovementsByNamePatterns(
      kommuneNumber,
      kommune.name,
      nameFilter
    );
    movements.push(...nameMovements);

    // Method 3: Cross-Kommune Address Analysis
    console.log("🗺️ Method 3: Cross-referencing addresses...");
    const crossMovements = await findMovementsByCrossReference(
      kommuneNumber,
      kommune.name
    );
    movements.push(...crossMovements);

    // Remove duplicates and sort by confidence
    const uniqueMovements = removeDuplicates(movements);
    const sortedMovements = uniqueMovements.sort((a, b) => {
      const confidenceOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    });

    // Filter results if not including all
    const filteredMovements = includeAll
      ? sortedMovements
      : sortedMovements.filter((m) => m.confidence !== "LOW");

    console.log(
      `✅ Found ${filteredMovements.length} potential movements (${uniqueMovements.length} total)`
    );

    return NextResponse.json({
      success: true,
      kommune: {
        number: kommuneNumber,
        name: kommune.name,
      },
      movements: filteredMovements,
      statistics: {
        totalFound: uniqueMovements.length,
        highConfidence: uniqueMovements.filter((m) => m.confidence === "HIGH")
          .length,
        mediumConfidence: uniqueMovements.filter(
          (m) => m.confidence === "MEDIUM"
        ).length,
        lowConfidence: uniqueMovements.filter((m) => m.confidence === "LOW")
          .length,
      },
      detectionMethods: [
        "Address History Analysis",
        "Business Name Patterns",
        "Cross-Kommune Reference",
      ],
    });
  } catch (error) {
    console.error("Organic movement detection error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Movement detection failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function findMovementsByAddressHistory(
  kommuneNumber: string,
  kommuneName: string
): Promise<MovementResult[]> {
  const movements: MovementResult[] = [];

  // Find companies with address history showing they were in this kommune
  const companiesWithHistory = await prisma.companyAddressHistory.findMany({
    where: {
      OR: [
        { kommuneNumber },
        { kommuneName: { contains: kommuneName, mode: "insensitive" } },
        { city: { contains: kommuneName, mode: "insensitive" } },
      ],
    },
    include: {
      company: {
        include: {
          addressHistory: {
            orderBy: { fromDate: "desc" },
            take: 5,
          },
        },
      },
    },
  });

  for (const historyRecord of companiesWithHistory) {
    const company = historyRecord.company;
    const allHistory = company.addressHistory;

    // Check if company has moved out (current address different from this kommune)
    const currentHistory = allHistory.find((h) => h.isCurrentAddress);

    if (currentHistory && currentHistory.kommuneNumber !== kommuneNumber) {
      movements.push({
        organizationNumber: company.organizationNumber,
        name: company.name,
        previousAddress: historyRecord.address,
        currentAddress: currentHistory.address,
        previousKommune: `${historyRecord.kommuneName} (${historyRecord.kommuneNumber})`,
        currentKommune: `${currentHistory.kommuneName} (${currentHistory.kommuneNumber})`,
        detectionMethod: "Address History Analysis",
        confidence: "HIGH",
        moveDate: currentHistory.fromDate || undefined,
      });
    }
  }

  return movements;
}

async function findMovementsByNamePatterns(
  kommuneNumber: string,
  kommuneName: string,
  nameFilter: string
): Promise<MovementResult[]> {
  const movements: MovementResult[] = [];

  // Business patterns that often indicate local businesses that might move
  const businessPatterns = [
    "hotel",
    "hotell",
    "restaurant",
    "cafe",
    "kafé",
    "pub",
    "bar",
    "frisør",
    "tannlege",
    "lege",
    "apotek",
    "butikk",
    "shop",
    "bakeri",
    "konditori",
    "pizzeria",
    "kebab",
    "sushi",
    "bil",
    "auto",
    "verksted",
    "service",
    "reparasjon",
    "eiendom",
    "bygg",
    "anlegg",
    "håndverk",
    "elektro",
    "blomster",
    "gartner",
    "sport",
    "trening",
    "fitness",
  ];

  // Add custom name filter if provided
  const searchPatterns = nameFilter
    ? [nameFilter, ...businessPatterns]
    : businessPatterns;

  for (const pattern of searchPatterns) {
    // Find companies with names matching the pattern
    const companies = await prisma.company.findMany({
      where: {
        name: {
          contains: pattern,
          mode: "insensitive",
        },
      },
      include: {
        addressHistory: {
          orderBy: { fromDate: "desc" },
        },
      },
    });

    for (const company of companies) {
      // Check if company has any connection to our kommune
      const hasKommuneConnection = company.addressHistory.some(
        (h) =>
          h.kommuneNumber === kommuneNumber ||
          h.kommuneName?.toLowerCase().includes(kommuneName.toLowerCase()) ||
          h.city?.toLowerCase().includes(kommuneName.toLowerCase())
      );

      if (hasKommuneConnection) {
        const currentAddress = company.addressHistory.find(
          (h) => h.isCurrentAddress
        );
        const previousInKommune = company.addressHistory.find(
          (h) => h.kommuneNumber === kommuneNumber && !h.isCurrentAddress
        );

        if (
          currentAddress &&
          previousInKommune &&
          currentAddress.kommuneNumber !== kommuneNumber
        ) {
          movements.push({
            organizationNumber: company.organizationNumber,
            name: company.name,
            previousAddress: previousInKommune.address,
            currentAddress: currentAddress.address,
            previousKommune: `${previousInKommune.kommuneName} (${previousInKommune.kommuneNumber})`,
            currentKommune: `${currentAddress.kommuneName} (${currentAddress.kommuneNumber})`,
            detectionMethod: `Name Pattern: "${pattern}"`,
            confidence:
              nameFilter && pattern === nameFilter ? "HIGH" : "MEDIUM",
            moveDate: currentAddress.fromDate || undefined,
          });
        }
      }
    }
  }

  return movements;
}

async function findMovementsByCrossReference(
  kommuneNumber: string,
  kommuneName: string
): Promise<MovementResult[]> {
  const movements: MovementResult[] = [];

  // Find companies currently in other kommuner but with postal addresses in our kommune
  const companies = await prisma.company.findMany({
    where: {
      NOT: {
        currentKommuneId: {
          in: await prisma.kommune
            .findMany({
              where: { kommuneNumber },
              select: { id: true },
            })
            .then((results) => results.map((r) => r.id)),
        },
      },
    },
    include: {
      addressHistory: true,
      currentKommune: true,
    },
  });

  for (const company of companies) {
    // Check if postal address or business address references our kommune
    let hasKommuneReference = false;
    let referenceAddress = "";

    if (company.postalAddress) {
      const postalStr = JSON.stringify(company.postalAddress).toLowerCase();
      if (
        postalStr.includes(kommuneName.toLowerCase()) ||
        postalStr.includes(kommuneNumber)
      ) {
        hasKommuneReference = true;
        referenceAddress = formatAddressFromObject(company.postalAddress);
      }
    }

    if (company.businessAddress) {
      const businessStr = JSON.stringify(company.businessAddress).toLowerCase();
      if (
        businessStr.includes(kommuneName.toLowerCase()) ||
        businessStr.includes(kommuneNumber)
      ) {
        hasKommuneReference = true;
        referenceAddress = formatAddressFromObject(company.businessAddress);
      }
    }

    if (hasKommuneReference) {
      movements.push({
        organizationNumber: company.organizationNumber,
        name: company.name,
        previousAddress: referenceAddress,
        currentAddress: company.currentAddress || "Unknown",
        previousKommune: kommuneName,
        currentKommune: company.currentKommune?.name || "Unknown",
        detectionMethod: "Cross-Reference Analysis",
        confidence: "MEDIUM",
      });
    }
  }

  return movements;
}

function removeDuplicates(movements: MovementResult[]): MovementResult[] {
  const seen = new Set<string>();
  return movements.filter((movement) => {
    const key = movement.organizationNumber;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatAddressFromObject(addressObj: any): string {
  if (!addressObj) return "";

  const parts = [];
  if (addressObj.adresse && Array.isArray(addressObj.adresse)) {
    parts.push(...addressObj.adresse);
  }
  if (addressObj.postnummer) parts.push(addressObj.postnummer);
  if (addressObj.poststed) parts.push(addressObj.poststed);

  return parts.filter(Boolean).join(", ");
}
