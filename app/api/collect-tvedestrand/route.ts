import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { delay } from "@/lib/config/api-delays";

/**
 * Tvedestrand Data Collection API
 *
 * Clean, structured logging for data collection testing
 * Kommune: 4211 (Tvedestrand, Agder)
 */

interface CollectionProgress {
  phase: string;
  status: "starting" | "in_progress" | "completed" | "error";
  message: string;
  data?: any;
  timestamp: string;
}

interface CollectionResult {
  success: boolean;
  kommune: {
    number: string;
    name: string;
    county: string;
    region: string;
  };
  statistics: {
    entitiesFound: number;
    companiesSaved: number;
    addressHistoryCreated: number;
    postalCodesCollected: number;
    processingTime: string;
  };
  progress: CollectionProgress[];
  insights: string[];
}

let progressLog: CollectionProgress[] = [];

function logProgress(
  phase: string,
  status: CollectionProgress["status"],
  message: string,
  data?: any
) {
  const entry: CollectionProgress = {
    phase,
    status,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  progressLog.push(entry);

  // Clean console logging
  const timeStr = entry.timestamp.split("T")[1].split(".")[0];
  const statusEmoji = {
    starting: "🚀",
    in_progress: "⚙️",
    completed: "✅",
    error: "❌",
  }[status];

  console.log(`[${timeStr}] ${statusEmoji} ${phase}: ${message}`);
  if (data) {
    console.log(`    └─ ${JSON.stringify(data, null, 2)}`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  progressLog = []; // Reset progress log

  try {
    logProgress(
      "INITIALIZATION",
      "starting",
      "Starting Tvedestrand data collection"
    );

    // Step 1: Setup kommune
    logProgress(
      "SETUP",
      "starting",
      "Setting up Tvedestrand kommune in database"
    );
    const kommune = await setupTvedestrandKommune();
    logProgress("SETUP", "completed", "Kommune setup completed", {
      kommuneId: kommune.id,
      name: kommune.name,
    });

    // Step 2: Fetch entities
    logProgress(
      "API_FETCH",
      "starting",
      "Fetching entities from Brønnøysundregistrene"
    );
    const entities = await fetchTvedestrandEntities();
    logProgress("API_FETCH", "completed", "Entity fetching completed", {
      entitiesFound: entities.length,
      sampleEntity: entities[0]
        ? {
            name: entities[0].navn,
            orgNumber: entities[0].organisasjonsnummer,
            city: entities[0].forretningsadresse?.poststed,
          }
        : null,
    });

    if (entities.length === 0) {
      logProgress("API_FETCH", "error", "No entities found for Tvedestrand");
      throw new Error("No entities found for Tvedestrand kommune");
    }

    // Step 3: Process and save data
    logProgress(
      "DATA_PROCESSING",
      "starting",
      "Processing and saving company data"
    );
    const processingResults = await processAndSaveEntities(entities, kommune);
    logProgress(
      "DATA_PROCESSING",
      "completed",
      "Data processing completed",
      processingResults
    );

    // Step 4: Collect postal codes
    logProgress(
      "POSTAL_CODES",
      "starting",
      "Collecting postal codes for the region"
    );
    const postalCodeResults = await collectPostalCodes(entities, kommune);
    logProgress(
      "POSTAL_CODES",
      "completed",
      "Postal code collection completed",
      postalCodeResults
    );

    // Step 5: Verification
    logProgress("VERIFICATION", "starting", "Verifying saved data integrity");
    const verification = await verifyDataIntegrity(entities);
    logProgress(
      "VERIFICATION",
      "completed",
      "Data verification completed",
      verification
    );

    const totalTime = Date.now() - startTime;
    logProgress(
      "COMPLETION",
      "completed",
      `Tvedestrand data collection completed in ${Math.round(totalTime / 1000)}s`
    );

    const result: CollectionResult = {
      success: true,
      kommune: {
        number: "4211",
        name: "Tvedestrand",
        county: "Agder",
        region: "Sørlandet",
      },
      statistics: {
        entitiesFound: entities.length,
        companiesSaved: processingResults.companiesSaved,
        addressHistoryCreated: processingResults.addressHistoryCreated,
        postalCodesCollected: postalCodeResults.postalCodesCollected,
        processingTime: `${Math.round(totalTime / 1000)}s`,
      },
      progress: progressLog,
      insights: [
        `🎯 Successfully processed ${entities.length} companies in Tvedestrand`,
        `💾 Saved ${processingResults.companiesSaved} companies to database`,
        `📍 Created ${processingResults.addressHistoryCreated} address history records`,
        `📮 Collected ${postalCodeResults.postalCodesCollected} unique postal codes`,
        `⚡ Processing rate: ${Math.round(entities.length / (totalTime / 1000))} entities/second`,
        `✅ Data integrity: ${verification.allDataValid ? "VERIFIED" : "ISSUES DETECTED"}`,
      ],
    };

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logProgress("ERROR", "error", `Collection failed: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: "Tvedestrand data collection failed",
        message: errorMessage,
        progress: progressLog,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function setupTvedestrandKommune() {
  const kommune = await prisma.kommune.upsert({
    where: { kommuneNumber: "4211" },
    update: {
      name: "Tvedestrand",
      county: "Agder",
      region: "Sørlandet",
      priority: "medium",
    },
    create: {
      kommuneNumber: "4211",
      name: "Tvedestrand",
      county: "Agder",
      region: "Sørlandet",
      priority: "medium",
    },
  });

  return kommune;
}

async function fetchTvedestrandEntities() {
  const allEntities: any[] = [];
  let page = 0;
  const pageSize = 1000;
  const kommuneNumber = "4211";

  while (true) {
    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=${pageSize}&page=${page}`;

    logProgress("API_FETCH", "in_progress", `Fetching page ${page + 1}`, {
      url: url.replace(/&/g, " & "),
      pageSize,
    });

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-tvedestrand/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const entities = data._embedded?.enheter || [];

    logProgress("API_FETCH", "in_progress", `Page ${page + 1} processed`, {
      entitiesThisPage: entities.length,
      totalSoFar: allEntities.length + entities.length,
      totalAvailable: data.page?.totalElements || "unknown",
    });

    if (entities.length === 0) {
      logProgress(
        "API_FETCH",
        "in_progress",
        "No more entities found, ending pagination"
      );
      break;
    }

    allEntities.push(...entities);

    // Check pagination limits
    const totalPages = data.page?.totalPages || 0;
    if (page >= totalPages - 1 || pageSize * (page + 2) > 10000) {
      logProgress("API_FETCH", "in_progress", "Reached pagination limit");
      break;
    }

    page++;

    // Rate limiting
    if (page < totalPages) {
      logProgress("API_FETCH", "in_progress", "Rate limiting pause (1 second)");
      await delay.betweenBronnøysundCalls();
    }
  }

  return allEntities;
}

async function processAndSaveEntities(entities: any[], kommune: any) {
  let companiesSaved = 0;
  let addressHistoryCreated = 0;
  const batchSize = 50;
  const totalBatches = Math.ceil(entities.length / batchSize);

  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    logProgress(
      "DATA_PROCESSING",
      "in_progress",
      `Processing batch ${batchNumber}/${totalBatches}`,
      {
        entitiesInBatch: batch.length,
        progress: `${Math.round((i / entities.length) * 100)}%`,
      }
    );

    for (const entity of batch) {
      try {
        // Map company data
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

        // Save address history
        const addressCount = await saveAddressHistory(
          savedCompany.id,
          companyData,
          entity
        );
        addressHistoryCreated += addressCount;
      } catch (error) {
        logProgress(
          "DATA_PROCESSING",
          "error",
          `Failed to process entity ${entity.organisasjonsnummer}: ${error}`
        );
        // Continue with other entities
      }
    }

    logProgress(
      "DATA_PROCESSING",
      "in_progress",
      `Batch ${batchNumber} completed`,
      {
        companiesSaved: batch.length,
        totalProgress: `${Math.round(((i + batch.length) / entities.length) * 100)}%`,
      }
    );
  }

  return { companiesSaved, addressHistoryCreated };
}

async function saveAddressHistory(
  companyId: string,
  companyData: any,
  originalEntity: any
): Promise<number> {
  let count = 0;

  if (originalEntity.forretningsadresse) {
    await prisma.companyAddressHistory.create({
      data: {
        companyId,
        organizationNumber: companyData.organizationNumber,
        address: formatAddress(originalEntity.forretningsadresse),
        postalCode: originalEntity.forretningsadresse.postnummer,
        city: originalEntity.forretningsadresse.poststed,
        kommuneNumber:
          originalEntity.forretningsadresse.kommunenummer || "4211",
        kommuneName:
          originalEntity.forretningsadresse.poststed || "Tvedestrand",
        addressType: "business",
        fromDate: companyData.registrationDate || new Date(),
        isCurrentAddress: true,
      },
    });
    count++;
  }

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
        kommuneNumber: originalEntity.postadresse.kommunenummer || "4211",
        kommuneName: originalEntity.postadresse.poststed || "Tvedestrand",
        addressType: "postal",
        fromDate: companyData.registrationDate || new Date(),
        isCurrentAddress: true,
      },
    });
    count++;
  }

  return count;
}

async function collectPostalCodes(entities: any[], kommune: any) {
  const postalCodeSet = new Set<string>();
  const postalCodeMap = new Map<string, string>(); // code -> city

  // Extract postal codes from entities
  for (const entity of entities) {
    if (
      entity.forretningsadresse?.postnummer &&
      entity.forretningsadresse?.poststed
    ) {
      const code = entity.forretningsadresse.postnummer;
      const city = entity.forretningsadresse.poststed;
      postalCodeSet.add(code);
      postalCodeMap.set(code, city);
    }

    if (entity.postadresse?.postnummer && entity.postadresse?.poststed) {
      const code = entity.postadresse.postnummer;
      const city = entity.postadresse.poststed;
      postalCodeSet.add(code);
      postalCodeMap.set(code, city);
    }
  }

  // Save postal codes to database
  let postalCodesCollected = 0;
  for (const [postalCode, city] of Array.from(postalCodeMap.entries())) {
    await prisma.kommunePostalCode.upsert({
      where: {
        kommuneNumber_postalCode: {
          kommuneNumber: "4211",
          postalCode,
        },
      },
      update: { city, isActive: true },
      create: {
        kommuneId: kommune.id,
        kommuneNumber: "4211",
        postalCode,
        city,
        isActive: true,
      },
    });
    postalCodesCollected++;
  }

  return { postalCodesCollected };
}

async function verifyDataIntegrity(originalEntities: any[]) {
  const orgNumbers = originalEntities.map((e) => e.organisasjonsnummer);

  const companiesInDB = await prisma.company.count({
    where: { organizationNumber: { in: orgNumbers } },
  });

  const addressHistoryCount = await prisma.companyAddressHistory.count({
    where: { organizationNumber: { in: orgNumbers } },
  });

  const postalCodeCount = await prisma.kommunePostalCode.count({
    where: { kommuneNumber: "4211" },
  });

  const allDataValid =
    companiesInDB === originalEntities.length && addressHistoryCount > 0;

  return {
    originalEntities: originalEntities.length,
    companiesInDB,
    addressHistoryCount,
    postalCodeCount,
    allDataValid,
    completionRate: `${Math.round((companiesInDB / originalEntities.length) * 100)}%`,
  };
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

function calculateRiskScore(entity: any): number {
  let score = 0;
  if (entity.konkurs) score += 50;
  return score;
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    service: "Tvedestrand Data Collection",
    description:
      "Clean, structured data collection for Tvedestrand kommune (4211)",
    usage: "POST to start data collection with structured logging",
    features: [
      "✅ Clean console logging without curl noise",
      "✅ Structured progress tracking",
      "✅ Comprehensive data verification",
      "✅ Address history tracking",
      "✅ Postal code collection",
      "✅ Error handling and recovery",
    ],
    kommune: {
      number: "4211",
      name: "Tvedestrand",
      county: "Agder",
      region: "Sørlandet",
    },
    timestamp: new Date().toISOString(),
  });
}
