import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { delay } from "@/lib/config/api-delays";

/**
 * Minimal Test API - Small subset test with real data
 *
 * Fetches just 10-20 real entities to verify:
 * - API connectivity
 * - Data parsing and mapping
 * - Database saving
 * - Address history tracking
 * - Postal code collection
 */

interface TestEntity {
  organisasjonsnummer: string;
  navn: string;
  forretningsadresse?: any;
  postadresse?: any;
  konkurs?: boolean;
  organisasjonsform?: any;
  naeringskode1?: any;
  registreringsdatoEnhetsregisteret?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { kommuneNumber = "4201", maxEntities = 10 } = await request.json();

    console.log(
      `🧪 MINIMAL TEST: Starting with ${maxEntities} entities from kommune ${kommuneNumber}...`
    );
    const startTime = Date.now();

    // Step 1: Fetch small subset from API
    console.log(
      `📥 [${new Date().toISOString()}] Fetching ${maxEntities} entities from API...`
    );
    const entities = await fetchSmallSubset(kommuneNumber, maxEntities);
    console.log(`✅ Fetched ${entities.length} entities from API`);

    if (entities.length === 0) {
      return NextResponse.json({
        success: false,
        error: "No entities found",
        message: `No entities found for kommune ${kommuneNumber}`,
        timestamp: new Date().toISOString(),
      });
    }

    // Step 2: Process and save entities
    console.log(
      `💾 [${new Date().toISOString()}] Processing and saving entities...`
    );
    const results = await processMinimalEntities(entities, kommuneNumber);

    // Step 3: Verify data was saved correctly
    console.log(`🔍 [${new Date().toISOString()}] Verifying saved data...`);
    const verification = await verifyDataSaving(entities);

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      test: "Minimal Subset Test",
      input: {
        kommuneNumber,
        maxEntities,
        requestedCount: maxEntities,
      },
      apiResults: {
        entitiesFetched: entities.length,
        sampleEntity: entities[0]
          ? {
              organisasjonsnummer: entities[0].organisasjonsnummer,
              navn: entities[0].navn,
              hasBusinessAddress: !!entities[0].forretningsadresse,
              hasPostalAddress: !!entities[0].postadresse,
              isBankrupt: !!entities[0].konkurs,
            }
          : null,
      },
      processingResults: results,
      verification: verification,
      performance: {
        totalTime: `${totalTime}ms`,
        avgTimePerEntity: `${Math.round(totalTime / entities.length)}ms`,
        entitiesPerSecond: Math.round(entities.length / (totalTime / 1000)),
      },
      insights: [
        `📊 Successfully fetched ${entities.length} real entities`,
        `💾 Processed ${results.companiesSaved} companies`,
        `📍 Created ${results.addressHistoryCreated} address history records`,
        `📮 Collected ${results.postalCodesCollected} postal codes`,
        `✅ Data verification: ${verification.allDataPresent ? "PASSED" : "FAILED"}`,
        `⚡ Processing speed: ${Math.round(entities.length / (totalTime / 1000))} entities/second`,
      ],
      recommendations: verification.allDataPresent
        ? [
            "✅ All systems working correctly with real data",
            "🚀 Ready to scale to larger datasets",
            "📊 Consider running full kommune test",
          ]
        : [
            "🔍 Check data mapping and saving logic",
            "🐛 Debug missing data fields",
            "📋 Verify database constraints",
          ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Minimal test failed:", error);

    return NextResponse.json(
      {
        success: false,
        test: "Minimal Subset Test",
        error: "Test failed",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function fetchSmallSubset(
  kommuneNumber: string,
  maxEntities: number
): Promise<TestEntity[]> {
  const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=${maxEntities}&page=0`;

  console.log(`🔗 API URL: ${url}`);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "konkurser-i-norge-minimal-test/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `API request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const entities = data._embedded?.enheter || [];

  console.log(`📊 API Response Summary:`);
  console.log(`  ├─ Entities returned: ${entities.length}`);
  console.log(`  ├─ Total available: ${data.page?.totalElements || "unknown"}`);
  console.log(
    `  └─ Page info: ${data.page?.number || 0}/${data.page?.totalPages || "unknown"}`
  );

  return entities;
}

async function processMinimalEntities(
  entities: TestEntity[],
  kommuneNumber: string
) {
  let companiesSaved = 0;
  let addressHistoryCreated = 0;
  let postalCodesCollected = 0;
  const errors: string[] = [];

  // Ensure kommune exists
  console.log(`🏘️ Ensuring kommune ${kommuneNumber} exists...`);
  const kommune = await prisma.kommune.upsert({
    where: { kommuneNumber },
    update: {},
    create: {
      kommuneNumber,
      name: `Kommune ${kommuneNumber}`,
      county: "Test County",
    },
  });
  console.log(`✅ Kommune ensured with ID: ${kommune.id}`);

  // Process each entity
  for (const [index, entity] of Array.from(entities.entries())) {
    try {
      console.log(
        `📝 [${index + 1}/${entities.length}] Processing: ${entity.organisasjonsnummer} (${entity.navn})`
      );

      // Map entity data
      const companyData = {
        organizationNumber: entity.organisasjonsnummer,
        name: entity.navn,
        organizationForm: entity.organisasjonsform?.kode,
        status: entity.konkurs ? "Bankruptcy" : "Active",
        registrationDate: entity.registreringsdatoEnhetsregisteret
          ? new Date(entity.registreringsdatoEnhetsregisteret)
          : undefined,
        industry: entity.naeringskode1?.beskrivelse,
        industryCode: entity.naeringskode1?.kode,
        businessAddress: entity.forretningsadresse,
        postalAddress: entity.postadresse,
        currentAddress: formatAddress(entity.forretningsadresse),
        currentPostalCode: entity.forretningsadresse?.postnummer,
        currentCity: entity.forretningsadresse?.poststed,
        isBankrupt: entity.konkurs || false,
        riskScore: calculateRiskScore(entity),
        lastUpdated: new Date(),
      };

      // Save company
      const savedCompany = await prisma.company.upsert({
        where: { organizationNumber: entity.organisasjonsnummer },
        update: companyData,
        create: companyData,
      });
      companiesSaved++;
      console.log(`  ✅ Company saved with ID: ${savedCompany.id}`);

      // Save address history
      const addressHistoryCount = await saveAddressHistory(
        savedCompany.id,
        companyData,
        entity
      );
      addressHistoryCreated += addressHistoryCount;
      console.log(
        `  📍 Created ${addressHistoryCount} address history records`
      );

      // Collect postal codes (just from this entity)
      const postalCodes = extractPostalCodes(entity, kommuneNumber);
      for (const postalCode of postalCodes) {
        await prisma.kommunePostalCode.upsert({
          where: {
            kommuneNumber_postalCode: {
              kommuneNumber,
              postalCode: postalCode.postalCode,
            },
          },
          update: {
            city: postalCode.city,
            isActive: true,
          },
          create: {
            kommuneId: kommune.id,
            kommuneNumber,
            postalCode: postalCode.postalCode,
            city: postalCode.city,
            isActive: true,
          },
        });
      }
      postalCodesCollected += postalCodes.length;
    } catch (error) {
      const errorMsg = `Failed to process ${entity.organisasjonsnummer}: ${error instanceof Error ? error.message : error}`;
      console.error(`  ❌ ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return {
    companiesSaved,
    addressHistoryCreated,
    postalCodesCollected,
    errors,
    successRate: Math.round((companiesSaved / entities.length) * 100),
  };
}

async function saveAddressHistory(
  companyId: string,
  companyData: any,
  originalEntity: TestEntity
): Promise<number> {
  let count = 0;

  // Business address
  if (originalEntity.forretningsadresse) {
    await prisma.companyAddressHistory.create({
      data: {
        companyId,
        organizationNumber: companyData.organizationNumber,
        address: formatAddress(originalEntity.forretningsadresse),
        postalCode: originalEntity.forretningsadresse.postnummer,
        city: originalEntity.forretningsadresse.poststed,
        kommuneNumber: originalEntity.forretningsadresse.kommunenummer,
        kommuneName: originalEntity.forretningsadresse.poststed,
        addressType: "business",
        fromDate: companyData.registrationDate || new Date(),
        isCurrentAddress: true,
      },
    });
    count++;
  }

  // Postal address (if different)
  if (
    originalEntity.postadresse &&
    JSON.stringify(originalEntity.postadresse) !==
      JSON.stringify(originalEntity.forretningsadresse)
  ) {
    await prisma.companyAddressHistory.create({
      data: {
        companyId,
        organizationNumber: companyData.organizationNumber,
        address: formatAddress(originalEntity.postadresse),
        postalCode: originalEntity.postadresse.postnummer,
        city: originalEntity.postadresse.poststed,
        kommuneNumber: originalEntity.postadresse.kommunenummer,
        kommuneName: originalEntity.postadresse.poststed,
        addressType: "postal",
        fromDate: companyData.registrationDate || new Date(),
        isCurrentAddress: true,
      },
    });
    count++;
  }

  return count;
}

function extractPostalCodes(
  entity: TestEntity,
  kommuneNumber: string
): Array<{ postalCode: string; city: string }> {
  const codes: Array<{ postalCode: string; city: string }> = [];

  if (
    entity.forretningsadresse?.postnummer &&
    entity.forretningsadresse?.poststed
  ) {
    codes.push({
      postalCode: entity.forretningsadresse.postnummer,
      city: entity.forretningsadresse.poststed,
    });
  }

  if (
    entity.postadresse?.postnummer &&
    entity.postadresse?.poststed &&
    entity.postadresse.postnummer !== entity.forretningsadresse?.postnummer
  ) {
    codes.push({
      postalCode: entity.postadresse.postnummer,
      city: entity.postadresse.poststed,
    });
  }

  return codes;
}

async function verifyDataSaving(originalEntities: TestEntity[]) {
  const verification = {
    companiesInDB: 0,
    addressHistoryRecords: 0,
    postalCodeRecords: 0,
    sampleCompany: null as any,
    allDataPresent: false,
  };

  // Count saved companies
  const orgNumbers = originalEntities.map((e) => e.organisasjonsnummer);
  verification.companiesInDB = await prisma.company.count({
    where: {
      organizationNumber: { in: orgNumbers },
    },
  });

  // Count address history
  verification.addressHistoryRecords = await prisma.companyAddressHistory.count(
    {
      where: {
        organizationNumber: { in: orgNumbers },
      },
    }
  );

  // Count postal codes
  verification.postalCodeRecords = await prisma.kommunePostalCode.count();

  // Get sample company with relations
  if (orgNumbers.length > 0) {
    verification.sampleCompany = await prisma.company.findFirst({
      where: {
        organizationNumber: orgNumbers[0],
      },
      include: {
        addressHistory: true,
      },
    });
  }

  verification.allDataPresent =
    verification.companiesInDB === originalEntities.length &&
    verification.addressHistoryRecords > 0 &&
    verification.postalCodeRecords > 0;

  return verification;
}

function formatAddress(addressObj: any): string {
  if (!addressObj) return "";

  const parts = [
    addressObj.adresse?.[0],
    addressObj.postnummer,
    addressObj.poststed,
  ].filter(Boolean);

  return parts.join(", ");
}

function calculateRiskScore(entity: TestEntity): number {
  let score = 0;
  if (entity.konkurs) score += 50;
  return score;
}

export async function GET(request: NextRequest) {
  try {
    // Get current database stats
    const stats = {
      totalCompanies: await prisma.company.count(),
      totalAddressHistory: await prisma.companyAddressHistory.count(),
      totalPostalCodes: await prisma.kommunePostalCode.count(),
      totalKommuner: await prisma.kommune.count(),
    };

    return NextResponse.json({
      success: true,
      test: "Minimal Test Status",
      currentStats: stats,
      usage: "POST with { kommuneNumber: '4201', maxEntities: 10 }",
      availableKommuner: ["4201", "0301", "4601"], // Risør, Oslo, Bergen
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get minimal test status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get status" },
      { status: 500 }
    );
  }
}
