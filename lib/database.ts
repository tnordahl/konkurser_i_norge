import { PrismaClient } from "@prisma/client";

// Global Prisma client instance
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Database utility functions
export async function getAllKommuner() {
  try {
    const kommuner = await prisma.kommune.findMany({
      select: {
        id: true,
        kommuneNumber: true,
        name: true,
        county: true,
        _count: {
          select: {
            bankruptcies: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return kommuner.map((kommune) => ({
      id: kommune.kommuneNumber,
      name: kommune.name,
      county: kommune.county,
      bankruptcyCount: kommune._count.bankruptcies,
    }));
  } catch (error) {
    console.error("Failed to fetch kommuner from database:", error);
    return [];
  }
}

export async function getKommuneById(kommuneNumber: string) {
  try {
    return await prisma.kommune.findUnique({
      where: { kommuneNumber },
      include: {
        bankruptcies: {
          orderBy: {
            bankruptcyDate: "desc",
          },
        },
      },
    });
  } catch (error) {
    console.error(`Failed to fetch kommune ${kommuneNumber}:`, error);
    return null;
  }
}

export async function getAllCompaniesFromDB(
  kommuneNumber: string,
  fromDate?: Date,
  toDate?: Date
) {
  try {
    const kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
      select: { id: true },
    });

    if (!kommune) {
      console.warn(`Kommune ${kommuneNumber} not found in database`);
      return [];
    }

    const whereClause: any = {
      currentKommuneId: kommune.id,
    };

    if (fromDate || toDate) {
      whereClause.registrationDate = {};
      if (fromDate) whereClause.registrationDate.gte = fromDate;
      if (toDate) whereClause.registrationDate.lte = toDate;
    }

    const companies = await prisma.company.findMany({
      where: whereClause,
      orderBy: {
        registrationDate: "desc",
      },
      take: 1000, // Increased limit to show more companies
    });

    return companies.map((c) => ({
      id: c.id,
      companyName: c.name,
      organizationNumber: c.organizationNumber,
      bankruptcyDate: "", // No bankruptcyDate field in new schema
      address: c.currentAddress || undefined,
      industry: c.industry || undefined,
      hasRecentAddressChange: false, // TODO: Calculate from address history
      lifespanInDays: c.registrationDate
        ? Math.floor(
            (new Date().getTime() - c.registrationDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0,
      isShellCompanySuspicious: false, // TODO: Calculate from risk profile
      registrationDate: c.registrationDate?.toISOString().split("T")[0],
      originalCompany: undefined, // Not applicable for new schema
      konkursbo: undefined, // TODO: Add konkursbo support if needed
    }));
  } catch (error) {
    console.error(
      `Failed to fetch all companies for kommune ${kommuneNumber}:`,
      error
    );
    return [];
  }
}

export async function getBankruptciesForKommune(
  kommuneNumber: string,
  fromDate?: Date,
  toDate?: Date
) {
  try {
    const kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
      select: { id: true },
    });

    if (!kommune) {
      console.warn(`Kommune ${kommuneNumber} not found in database`);
      return [];
    }

    const whereClause: any = {
      currentKommuneId: kommune.id,
      status: "BANKRUPTCY", // Only bankruptcy status companies
    };

    if (fromDate || toDate) {
      whereClause.registrationDate = {};
      if (fromDate) whereClause.registrationDate.gte = fromDate;
      if (toDate) whereClause.registrationDate.lte = toDate;
    }

    const companies = await prisma.company.findMany({
      where: whereClause,
      orderBy: {
        registrationDate: "desc",
      },
    });

    return companies.map((c) => ({
      id: c.id,
      companyName: c.name,
      organizationNumber: c.organizationNumber,
      bankruptcyDate: "", // No bankruptcyDate field in new schema
      address: c.currentAddress || undefined,
      industry: c.industry || undefined,
      hasRecentAddressChange: false, // TODO: Calculate from address history
      lifespanInDays: c.registrationDate
        ? Math.floor(
            (new Date().getTime() - c.registrationDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0,
      isShellCompanySuspicious: false, // TODO: Calculate from risk profile
      registrationDate: c.registrationDate?.toISOString().split("T")[0],
      originalCompany: undefined, // Not applicable for new schema
      konkursbo: undefined, // TODO: Add konkursbo support if needed
    }));
  } catch (error) {
    console.error(
      `Failed to fetch bankruptcies for kommune ${kommuneNumber}:`,
      error
    );
    return [];
  }
}

export async function saveBankruptcyData(
  kommuneNumber: string,
  bankruptcies: any[]
) {
  try {
    // First, ensure the kommune exists
    let kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
    });

    if (!kommune) {
      // Create kommune if it doesn't exist (with basic info)
      const kommuneInfo = getKommuneBasicInfo(kommuneNumber);
      kommune = await prisma.kommune.create({
        data: {
          kommuneNumber,
          name: kommuneInfo.name,
          county: kommuneInfo.county,
        },
      });
      console.log(`Created new kommune: ${kommune.name} (${kommuneNumber})`);
    }

    // Save bankruptcies with upsert to avoid duplicates
    let savedCount = 0;
    let updatedCount = 0;

    console.log(
      `💾 Attempting to save ${bankruptcies.length} bankruptcies for kommune ${kommuneNumber}`
    );

    for (const bankruptcy of bankruptcies) {
      console.log(
        `   - Processing: ${bankruptcy.companyName} (${bankruptcy.organizationNumber})`
      );
      const result = await prisma.bankruptcy.upsert({
        where: {
          organizationNumber: bankruptcy.organizationNumber,
        },
        update: {
          companyName: bankruptcy.companyName,
          address: bankruptcy.address,
          industry: bankruptcy.industry,
          hasRecentAddressChange: bankruptcy.hasRecentAddressChange || false,
          lifespanInDays: bankruptcy.lifespanInDays,
          isShellCompanySuspicious:
            bankruptcy.isShellCompanySuspicious || false,
          registrationDate: bankruptcy.registrationDate
            ? new Date(bankruptcy.registrationDate)
            : null,
          originalCompanyName: bankruptcy.originalCompany?.name,
          originalOrgNumber: bankruptcy.originalCompany?.organizationNumber,
          originalRegistrationDate: bankruptcy.originalCompany?.registrationDate
            ? new Date(bankruptcy.originalCompany.registrationDate)
            : null,
          konkursboName: bankruptcy.konkursbo?.name,
          konkursboOrgNumber: bankruptcy.konkursbo?.organizationNumber,
          konkursboEstablishmentDate: bankruptcy.konkursbo?.establishmentDate
            ? new Date(bankruptcy.konkursbo.establishmentDate)
            : null,
          updatedAt: new Date(),
        },
        create: {
          companyName: bankruptcy.companyName,
          organizationNumber: bankruptcy.organizationNumber,
          bankruptcyDate: new Date(bankruptcy.bankruptcyDate),
          kommuneId: kommune.id,
          address: bankruptcy.address,
          industry: bankruptcy.industry,
          hasRecentAddressChange: bankruptcy.hasRecentAddressChange || false,
          lifespanInDays: bankruptcy.lifespanInDays,
          isShellCompanySuspicious:
            bankruptcy.isShellCompanySuspicious || false,
          registrationDate: bankruptcy.registrationDate
            ? new Date(bankruptcy.registrationDate)
            : null,
          originalCompanyName: bankruptcy.originalCompany?.name,
          originalOrgNumber: bankruptcy.originalCompany?.organizationNumber,
          originalRegistrationDate: bankruptcy.originalCompany?.registrationDate
            ? new Date(bankruptcy.originalCompany.registrationDate)
            : null,
          konkursboName: bankruptcy.konkursbo?.name,
          konkursboOrgNumber: bankruptcy.konkursbo?.organizationNumber,
          konkursboEstablishmentDate: bankruptcy.konkursbo?.establishmentDate
            ? new Date(bankruptcy.konkursbo.establishmentDate)
            : null,
        },
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) {
        savedCount++;
      } else {
        updatedCount++;
      }
    }

    console.log(
      `💾 Saved ${savedCount} new bankruptcies, updated ${updatedCount} existing for kommune ${kommuneNumber}`
    );

    return {
      success: true,
      saved: savedCount,
      updated: updatedCount,
      total: bankruptcies.length,
    };
  } catch (error) {
    console.error(
      `Failed to save bankruptcy data for kommune ${kommuneNumber}:`,
      error
    );
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      saved: 0,
      updated: 0,
      total: bankruptcies.length,
    };
  }
}

export async function getDataCoverage(kommuneNumber: string) {
  try {
    const kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
      select: { id: true, name: true },
    });

    if (!kommune) {
      return {
        coverage: 0,
        totalDays: 365,
        missingDays: 365,
        dataGaps: ["Kommune ikke funnet i databasen"],
      };
    }

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const today = new Date();

    const bankruptcies = await prisma.bankruptcy.findMany({
      where: {
        kommuneId: kommune.id,
        bankruptcyDate: {
          gte: oneYearAgo,
          lte: today,
        },
      },
      select: {
        bankruptcyDate: true,
        companyName: true,
      },
      orderBy: {
        bankruptcyDate: "desc",
      },
    });

    // For bankruptcy data, we consider coverage as "data collection completeness"
    // If we have recent data collection attempts (not just bankruptcy events),
    // we have good coverage

    const totalDays = Math.ceil(
      (today.getTime() - oneYearAgo.getTime()) / (1000 * 60 * 60 * 24)
    );
    const bankruptcyCount = bankruptcies.length;

    // Coverage logic for bankruptcy monitoring:
    // - If we have recent bankruptcies (within last 30 days), consider high coverage
    // - If we have any bankruptcies in the period, consider medium coverage
    // - If no data at all, low coverage

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentBankruptcies = bankruptcies.filter(
      (b) => new Date(b.bankruptcyDate) >= thirtyDaysAgo
    );

    let coverage = 0;
    let status = "Ingen data samlet";

    if (bankruptcyCount > 0) {
      if (recentBankruptcies.length > 0) {
        // Recent data suggests active monitoring
        coverage = 100;
        status = `${bankruptcyCount} konkurser registrert - oppdatert datasystem`;
      } else {
        // Historical data but no recent updates
        coverage = 75;
        status = `${bankruptcyCount} konkurser funnet - kan ha nyere data tilgjengelig`;
      }
    } else {
      // No bankruptcies found - could be good news or missing data
      coverage = 50;
      status =
        "Ingen konkurser funnet - kan være komplett eller manglende data";
    }

    const dataGaps = coverage < 100 ? [status] : [];

    return {
      coverage: Math.round(coverage * 10) / 10,
      totalDays,
      missingDays:
        coverage < 100 ? Math.round(((100 - coverage) / 100) * totalDays) : 0,
      dataGaps,
      bankruptcyCount,
      recentBankruptcyCount: recentBankruptcies.length,
      lastBankruptcyDate:
        bankruptcies.length > 0
          ? bankruptcies[0].bankruptcyDate.toISOString().split("T")[0]
          : null,
    };
  } catch (error) {
    console.error(
      `Failed to calculate data coverage for kommune ${kommuneNumber}:`,
      error
    );
    return {
      coverage: 0,
      totalDays: 365,
      missingDays: 365,
      dataGaps: ["Kunne ikke beregne dekning"],
      bankruptcyCount: 0,
      recentBankruptcyCount: 0,
      lastBankruptcyDate: null,
    };
  }
}

// Helper function for basic kommune info (fallback)
function getKommuneBasicInfo(kommuneNumber: string) {
  // This is a simplified mapping - in a real system you'd have a complete database
  // Generic kommune lookup - would use external API in production
  // TODO: Implement dynamic kommune lookup from SSB or other official source
  const kommuneMap: Record<string, { name: string; county: string }> = {};

  return (
    kommuneMap[kommuneNumber] || {
      name: `Kommune ${kommuneNumber}`,
      county: "Ukjent fylke",
    }
  );
}
