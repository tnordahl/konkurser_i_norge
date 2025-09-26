import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { delay } from "@/lib/config/api-delays";
import { updateCollectionStatus } from "@/lib/collection-status";

/**
 * Unified Kommune Data Collection API
 *
 * Single service that works for ALL Norwegian kommuner
 * Clean, structured logging with comprehensive data collection
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
    successRate: string;
  };
  progress: CollectionProgress[];
  insights: string[];
  readyForMovementDetection: boolean;
}

let progressLog: CollectionProgress[] = [];

function logProgress(
  phase: string,
  status: CollectionProgress["status"],
  message: string,
  data?: any,
  kommuneNumber?: string
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
  if (data && Object.keys(data).length > 0) {
    console.log(`    └─ ${JSON.stringify(data, null, 2)}`);
  }

  // Update real-time status if kommuneNumber provided
  if (kommuneNumber) {
    updateCollectionStatus(kommuneNumber, {
      currentPhase: phase,
      status,
      message,
      data,
      progress: progressLog,
      lastUpdate: entry.timestamp,
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const startTime = Date.now();
  const kommuneNumber = params.kommuneNumber;
  progressLog = []; // Reset progress log

  try {
    logProgress(
      "INITIALIZATION",
      "starting",
      `Starting data collection for kommune ${kommuneNumber}`,
      undefined,
      kommuneNumber
    );

    // Step 1: Get or create kommune information
    logProgress(
      "SETUP",
      "starting",
      "Setting up kommune in database",
      undefined,
      kommuneNumber
    );
    const kommune = await setupKommune(kommuneNumber);
    logProgress(
      "SETUP",
      "completed",
      "Kommune setup completed",
      {
        kommuneId: kommune.id,
        name: kommune.name,
        county: kommune.county,
        region: kommune.region,
      },
      kommuneNumber
    );

    // Step 2: Fetch entities from Brønnøysundregistrene
    logProgress(
      "API_FETCH",
      "starting",
      "Fetching entities from Brønnøysundregistrene",
      undefined,
      kommuneNumber
    );
    const entities = await fetchKommuneEntities(kommuneNumber);
    logProgress(
      "API_FETCH",
      "completed",
      "Entity fetching completed",
      {
        entitiesFound: entities.length,
        sampleEntity: entities[0]
          ? {
              name: entities[0].navn,
              orgNumber: entities[0].organisasjonsnummer,
              city: entities[0].forretningsadresse?.poststed,
              postalCode: entities[0].forretningsadresse?.postnummer,
            }
          : null,
      },
      kommuneNumber
    );

    if (entities.length === 0) {
      logProgress(
        "API_FETCH",
        "error",
        `No entities found for kommune ${kommuneNumber}`,
        undefined,
        kommuneNumber
      );
      throw new Error(`No entities found for kommune ${kommuneNumber}`);
    }

    // Step 3: Process and save data
    logProgress(
      "DATA_PROCESSING",
      "starting",
      "Processing and saving company data",
      undefined,
      kommuneNumber
    );
    const processingResults = await processAndSaveEntities(
      entities,
      kommune,
      kommuneNumber
    );
    logProgress(
      "DATA_PROCESSING",
      "completed",
      "Data processing completed",
      processingResults,
      kommuneNumber
    );

    // Step 4: Collect postal codes
    logProgress(
      "POSTAL_CODES",
      "starting",
      "Collecting postal codes for the region",
      undefined,
      kommuneNumber
    );
    const postalCodeResults = await collectPostalCodes(entities, kommune);
    logProgress(
      "POSTAL_CODES",
      "completed",
      "Postal code collection completed",
      postalCodeResults,
      kommuneNumber
    );

    // Step 5: Verification
    logProgress(
      "VERIFICATION",
      "starting",
      "Verifying saved data integrity",
      undefined,
      kommuneNumber
    );
    const verification = await verifyDataIntegrity(entities, kommuneNumber);
    logProgress(
      "VERIFICATION",
      "completed",
      "Data verification completed",
      verification,
      kommuneNumber
    );

    const totalTime = Date.now() - startTime;
    const successRate = `${Math.round((processingResults.companiesSaved / entities.length) * 100)}%`;

    logProgress(
      "COMPLETION",
      "completed",
      `Data collection completed in ${Math.round(totalTime / 1000)}s with ${successRate} success rate`,
      undefined,
      kommuneNumber
    );

    const result: CollectionResult = {
      success: true,
      kommune: {
        number: kommuneNumber,
        name: kommune.name,
        county: kommune.county || "Unknown",
        region: kommune.region || "Unknown",
      },
      statistics: {
        entitiesFound: entities.length,
        companiesSaved: processingResults.companiesSaved,
        addressHistoryCreated: processingResults.addressHistoryCreated,
        postalCodesCollected: postalCodeResults.postalCodesCollected,
        processingTime: `${Math.round(totalTime / 1000)}s`,
        successRate,
      },
      progress: progressLog,
      insights: generateInsights(
        entities.length,
        processingResults,
        postalCodeResults,
        verification,
        totalTime
      ),
      readyForMovementDetection:
        verification.allDataValid &&
        processingResults.addressHistoryCreated > 0,
    };

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logProgress("ERROR", "error", `Collection failed: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: `Data collection failed for kommune ${kommuneNumber}`,
        message: errorMessage,
        progress: progressLog,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

async function setupKommune(kommuneNumber: string) {
  // Get kommune information from our service or create basic entry
  const kommuneInfo = getKommuneInfo(kommuneNumber);

  const kommune = await prisma.kommune.upsert({
    where: { kommuneNumber },
    update: {
      name: kommuneInfo.name,
      county: kommuneInfo.county,
      region: kommuneInfo.region,
      priority: kommuneInfo.priority,
    },
    create: {
      kommuneNumber,
      name: kommuneInfo.name,
      county: kommuneInfo.county,
      region: kommuneInfo.region,
      priority: kommuneInfo.priority,
    },
  });

  return kommune;
}

function getKommuneInfo(kommuneNumber: string) {
  // Basic kommune information - this could be expanded with a comprehensive lookup
  const kommuneMap: Record<string, any> = {
    "4201": {
      name: "Risør",
      county: "Agder",
      region: "Sørlandet",
      priority: "medium",
    },
    "4204": {
      name: "Kristiansand",
      county: "Agder",
      region: "Sørlandet",
      priority: "high",
    },
    "4211": {
      name: "Tvedestrand",
      county: "Agder",
      region: "Sørlandet",
      priority: "medium",
    },
    "4020": {
      name: "Midt-Telemark",
      county: "Telemark",
      region: "Østlandet",
      priority: "medium",
    },
    "0301": {
      name: "Oslo",
      county: "Oslo",
      region: "Østlandet",
      priority: "high",
    },
    "4601": {
      name: "Bergen",
      county: "Vestland",
      region: "Vestlandet",
      priority: "high",
    },
    "1103": {
      name: "Stavanger",
      county: "Rogaland",
      region: "Vestlandet",
      priority: "high",
    },
  };

  return (
    kommuneMap[kommuneNumber] || {
      name: `Kommune ${kommuneNumber}`,
      county: "Unknown",
      region: "Unknown",
      priority: "low",
    }
  );
}

async function fetchKommuneEntities(kommuneNumber: string) {
  const allEntities: any[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=${pageSize}&page=${page}`;

    logProgress("API_FETCH", "in_progress", `Fetching page ${page + 1}`, {
      pageSize,
      currentTotal: allEntities.length,
    });

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-unified/1.0",
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

async function processAndSaveEntities(
  entities: any[],
  kommune: any,
  kommuneNumber: string
) {
  let companiesSaved = 0;
  let addressHistoryCreated = 0;
  let errors = 0;
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
        companiesSavedSoFar: companiesSaved,
      },
      kommuneNumber
    );

    for (const entity of batch) {
      try {
        // Map company data
        const companyData = {
          organizationNumber: entity.organisasjonsnummer,
          name: entity.navn,
          organizationForm: entity.organisasjonsform?.kode,
          status: entity.konkurs ? "BANKRUPTCY" : "ACTIVE",
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
          currentKommuneId: kommune.id,
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
          entity,
          kommune
        );
        addressHistoryCreated += addressCount;
      } catch (error) {
        errors++;
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
        companiesSaved: batch.length - (errors > 0 ? 1 : 0), // Approximate
        totalProgress: `${Math.round(((i + batch.length) / entities.length) * 100)}%`,
      }
    );
  }

  return { companiesSaved, addressHistoryCreated, errors };
}

async function saveAddressHistory(
  companyId: string,
  companyData: any,
  originalEntity: any,
  kommune: any
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
          originalEntity.forretningsadresse.kommunenummer ||
          kommune.kommuneNumber,
        kommuneName: originalEntity.forretningsadresse.poststed || kommune.name,
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
        kommuneNumber:
          originalEntity.postadresse.kommunenummer || kommune.kommuneNumber,
        kommuneName: originalEntity.postadresse.poststed || kommune.name,
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
          kommuneNumber: kommune.kommuneNumber,
          postalCode,
        },
      },
      update: { city, isActive: true },
      create: {
        kommuneId: kommune.id,
        kommuneNumber: kommune.kommuneNumber,
        postalCode,
        city,
        isActive: true,
      },
    });
    postalCodesCollected++;
  }

  return { postalCodesCollected };
}

async function verifyDataIntegrity(
  originalEntities: any[],
  kommuneNumber: string
) {
  const orgNumbers = originalEntities.map((e) => e.organisasjonsnummer);

  const companiesInDB = await prisma.company.count({
    where: { organizationNumber: { in: orgNumbers } },
  });

  const addressHistoryCount = await prisma.companyAddressHistory.count({
    where: { organizationNumber: { in: orgNumbers } },
  });

  const postalCodeCount = await prisma.kommunePostalCode.count({
    where: { kommuneNumber },
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

function generateInsights(
  entitiesFound: number,
  processingResults: any,
  postalCodeResults: any,
  verification: any,
  totalTime: number
): string[] {
  return [
    `🎯 Successfully processed ${entitiesFound} companies`,
    `💾 Saved ${processingResults.companiesSaved} companies to database (${verification.completionRate} success rate)`,
    `📍 Created ${processingResults.addressHistoryCreated} address history records`,
    `📮 Collected ${postalCodeResults.postalCodesCollected} unique postal codes`,
    `⚡ Processing rate: ${Math.round(entitiesFound / (totalTime / 1000))} entities/second`,
    `✅ Data integrity: ${verification.allDataValid ? "VERIFIED" : "ISSUES DETECTED"}`,
    `🔄 Ready for cross-kommune fraud detection: ${verification.allDataValid && processingResults.addressHistoryCreated > 0 ? "YES" : "NO"}`,
  ];
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

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;
  const kommuneInfo = getKommuneInfo(kommuneNumber);

  return NextResponse.json({
    success: true,
    service: "Unified Kommune Data Collection",
    description: "Single service that works for ALL Norwegian kommuner",
    usage: "POST to start data collection with structured logging",
    features: [
      "✅ Works for any Norwegian kommune",
      "✅ Clean console logging without curl noise",
      "✅ Structured progress tracking",
      "✅ Comprehensive data verification",
      "✅ Address history tracking",
      "✅ Postal code collection",
      "✅ Error handling and recovery",
      "✅ Automatic kommune information lookup",
    ],
    targetKommune: {
      number: kommuneNumber,
      name: kommuneInfo.name,
      county: kommuneInfo.county,
      region: kommuneInfo.region,
    },
    timestamp: new Date().toISOString(),
  });
}
