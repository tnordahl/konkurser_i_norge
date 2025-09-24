import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Populate Address History API
 *
 * Ensures all companies have address history records by creating them from current addresses
 * This is essential for the address movement detection system to work properly
 */

export async function POST(request: NextRequest) {
  try {
    console.log("🏗️ Starting address history population...");

    // Get all companies that don't have address history
    const companiesWithoutHistory = await prisma.company.findMany({
      where: {
        addressHistory: {
          none: {},
        },
      },
      select: {
        id: true,
        organizationNumber: true,
        name: true,
        currentAddress: true,
        currentCity: true,
        currentPostalCode: true,
        currentKommuneId: true,
        businessAddress: true,
        postalAddress: true,
        registrationDate: true,
      },
      take: 1000, // Process in batches to avoid memory issues
    });

    console.log(
      `📊 Found ${companiesWithoutHistory.length} companies without address history`
    );

    let addressHistoryCreated = 0;
    const batchSize = 50;

    for (let i = 0; i < companiesWithoutHistory.length; i += batchSize) {
      const batch = companiesWithoutHistory.slice(i, i + batchSize);

      console.log(
        `📦 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(companiesWithoutHistory.length / batchSize)}`
      );

      for (const company of batch) {
        try {
          const historyCount = await createAddressHistoryForCompany(company);
          addressHistoryCreated += historyCount;
        } catch (error) {
          console.error(
            `❌ Failed to create address history for ${company.organizationNumber}:`,
            error
          );
        }
      }

      // Small delay between batches
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Get updated statistics
    const totalCompanies = await prisma.company.count();
    const companiesWithHistory = await prisma.company.count({
      where: {
        addressHistory: {
          some: {},
        },
      },
    });

    const coverage = Math.round((companiesWithHistory / totalCompanies) * 100);

    console.log(`✅ Address history population completed`);
    console.log(
      `📈 Coverage: ${companiesWithHistory}/${totalCompanies} companies (${coverage}%)`
    );

    return NextResponse.json({
      success: true,
      message: "Address history population completed",
      statistics: {
        totalCompanies,
        companiesWithHistory,
        coverage: `${coverage}%`,
        addressHistoryCreated,
        companiesProcessed: companiesWithoutHistory.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Address history population failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Address history population failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current address history statistics
    const totalCompanies = await prisma.company.count();
    const companiesWithHistory = await prisma.company.count({
      where: {
        addressHistory: {
          some: {},
        },
      },
    });

    const companiesWithoutHistory = totalCompanies - companiesWithHistory;
    const coverage =
      totalCompanies > 0
        ? Math.round((companiesWithHistory / totalCompanies) * 100)
        : 0;

    // Get sample companies without history
    const sampleWithoutHistory = await prisma.company.findMany({
      where: {
        addressHistory: {
          none: {},
        },
      },
      select: {
        organizationNumber: true,
        name: true,
        currentCity: true,
      },
      take: 5,
    });

    return NextResponse.json({
      success: true,
      statistics: {
        totalCompanies,
        companiesWithHistory,
        companiesWithoutHistory,
        coverage: `${coverage}%`,
        needsPopulation: companiesWithoutHistory > 0,
      },
      sampleWithoutHistory,
      recommendation:
        companiesWithoutHistory > 0
          ? "Run POST /api/populate-address-history to create address history for all companies"
          : "All companies have address history - system is ready",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get address history statistics:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get statistics",
      },
      { status: 500 }
    );
  }
}

async function createAddressHistoryForCompany(company: any): Promise<number> {
  let count = 0;

  // Create business address history from current address
  if (company.currentAddress && company.currentCity) {
    await prisma.companyAddressHistory.create({
      data: {
        companyId: company.id,
        organizationNumber: company.organizationNumber,
        address: company.currentAddress,
        postalCode: company.currentPostalCode || "",
        city: company.currentCity,
        kommuneNumber: await getKommuneNumberFromCity(company.currentCity),
        kommuneName: company.currentCity,
        addressType: "business",
        fromDate: company.registrationDate || new Date(),
        isCurrentAddress: true,
      },
    });
    count++;
  }

  // Create business address from businessAddress JSON if available
  if (company.businessAddress && typeof company.businessAddress === "object") {
    const addr = company.businessAddress as any;
    if (addr.adresse || addr.poststed) {
      await prisma.companyAddressHistory.create({
        data: {
          companyId: company.id,
          organizationNumber: company.organizationNumber,
          address: formatAddressFromJson(addr),
          postalCode: addr.postnummer || "",
          city: addr.poststed || company.currentCity || "",
          kommuneNumber:
            addr.kommunenummer ||
            (await getKommuneNumberFromCity(
              addr.poststed || company.currentCity
            )),
          kommuneName: addr.poststed || company.currentCity || "",
          addressType: "business",
          fromDate: company.registrationDate || new Date(),
          isCurrentAddress: true,
        },
      });
      count++;
    }
  }

  // Create postal address from postalAddress JSON if different from business
  if (company.postalAddress && typeof company.postalAddress === "object") {
    const addr = company.postalAddress as any;
    if (addr.adresse || addr.poststed) {
      const postalAddressStr = formatAddressFromJson(addr);
      const businessAddressStr =
        company.currentAddress ||
        formatAddressFromJson(company.businessAddress);

      // Only create if different from business address
      if (postalAddressStr !== businessAddressStr) {
        await prisma.companyAddressHistory.create({
          data: {
            companyId: company.id,
            organizationNumber: company.organizationNumber,
            address: postalAddressStr,
            postalCode: addr.postnummer || "",
            city: addr.poststed || "",
            kommuneNumber:
              addr.kommunenummer ||
              (await getKommuneNumberFromCity(addr.poststed)),
            kommuneName: addr.poststed || "",
            addressType: "postal",
            fromDate: company.registrationDate || new Date(),
            isCurrentAddress: true,
          },
        });
        count++;
      }
    }
  }

  return count;
}

function formatAddressFromJson(addressObj: any): string {
  if (!addressObj) return "";

  const parts: string[] = [];

  if (addressObj.adresse) {
    if (Array.isArray(addressObj.adresse)) {
      parts.push(addressObj.adresse.join(" "));
    } else {
      parts.push(addressObj.adresse);
    }
  }

  if (addressObj.postnummer) parts.push(addressObj.postnummer);
  if (addressObj.poststed) parts.push(addressObj.poststed);

  return parts.join(", ");
}

async function getKommuneNumberFromCity(cityName: string): Promise<string> {
  if (!cityName) return "";

  // Try to find kommune by city name
  const kommune = await prisma.kommune.findFirst({
    where: {
      OR: [
        { name: { contains: cityName, mode: "insensitive" } },
        {
          postalCodes: {
            some: { city: { contains: cityName, mode: "insensitive" } },
          },
        },
      ],
    },
    select: { kommuneNumber: true },
  });

  return kommune?.kommuneNumber || "";
}
