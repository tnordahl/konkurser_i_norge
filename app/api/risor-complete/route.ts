import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { delay } from "@/lib/config/api-delays";

/**
 * Risør Complete Test - Full data collection with clear progress tracking
 * 
 * Step 1: Fix database integration
 * Step 2: Run complete Risør data collection with easy-to-follow progress
 */

interface ProgressUpdate {
  step: string;
  status: "starting" | "in_progress" | "completed" | "error";
  details: string;
  timestamp: string;
  data?: any;
}

let progressLog: ProgressUpdate[] = [];

function logProgress(step: string, status: ProgressUpdate["status"], details: string, data?: any) {
  const update: ProgressUpdate = {
    step,
    status,
    details,
    timestamp: new Date().toISOString(),
    data
  };
  progressLog.push(update);
  console.log(`📊 [${update.timestamp}] ${step}: ${details}`);
  if (data) {
    console.log(`   └─ Data:`, data);
  }
}

export async function POST(request: NextRequest) {
  try {
    progressLog = []; // Reset progress log
    const startTime = Date.now();
    
    logProgress("INITIALIZATION", "starting", "Starting Risør complete data collection");

    // Step 1: Test database connection
    logProgress("DATABASE_TEST", "starting", "Testing database connection...");
    
    try {
      const testCount = await prisma.company.count();
      logProgress("DATABASE_TEST", "completed", `Database connected successfully`, { currentCompanies: testCount });
    } catch (dbError) {
      logProgress("DATABASE_TEST", "error", `Database connection failed: ${dbError instanceof Error ? dbError.message : dbError}`);
      throw new Error(`Database connection failed: ${dbError instanceof Error ? dbError.message : dbError}`);
    }

    // Step 2: Fetch entities from API
    logProgress("API_FETCH", "starting", "Fetching all entities for Risør (kommune 4201)...");
    
    const entities = await fetchAllRisorEntities();
    
    logProgress("API_FETCH", "completed", `Successfully fetched entities from API`, { 
      entitiesFound: entities.length,
      sampleEntity: entities[0]?.navn || "No entities"
    });

    if (entities.length === 0) {
      logProgress("API_FETCH", "error", "No entities found for Risør");
      throw new Error("No entities found for Risør");
    }

    // Step 3: Process and save data
    logProgress("DATA_PROCESSING", "starting", `Processing ${entities.length} entities...`);
    
    const results = await processEntitiesWithProgress(entities);
    
    logProgress("DATA_PROCESSING", "completed", "All entities processed successfully", results);

    // Step 4: Verify data integrity
    logProgress("VERIFICATION", "starting", "Verifying saved data...");
    
    const verification = await verifyDataIntegrity(entities);
    
    logProgress("VERIFICATION", "completed", "Data verification complete", verification);

    const totalTime = Date.now() - startTime;
    
    logProgress("COMPLETION", "completed", `Risør data collection completed successfully in ${Math.round(totalTime/1000)}s`);

    return NextResponse.json({
      success: true,
      test: "Risør Complete Data Collection",
      summary: {
        totalTime: `${Math.round(totalTime/1000)}s`,
        entitiesProcessed: entities.length,
        companiesSaved: results.companiesSaved,
        addressHistoryCreated: results.addressHistoryCreated,
        postalCodesCollected: results.postalCodesCollected,
        successRate: `${Math.round((results.companiesSaved / entities.length) * 100)}%`
      },
      verification,
      progressLog: progressLog.map(p => ({
        step: p.step,
        status: p.status,
        details: p.details,
        timestamp: p.timestamp.split('T')[1].split('.')[0], // Just time part
        ...(p.data && { data: p.data })
      })),
      insights: [
        `🎉 Successfully processed ${entities.length} companies from Risør`,
        `💾 Saved ${results.companiesSaved} companies to database`,
        `📍 Created ${results.addressHistoryCreated} address history records`,
        `📮 Collected ${results.postalCodesCollected} postal codes`,
        `✅ Data verification: ${verification.allDataValid ? 'PASSED' : 'FAILED'}`,
        `⚡ Processing speed: ${Math.round(entities.length / (totalTime / 1000))} entities/second`
      ],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    logProgress("ERROR", "error", `Test failed: ${errorMsg}`);
    
    return NextResponse.json({
      success: false,
      error: "Test failed",
      message: errorMsg,
      progressLog: progressLog.map(p => ({
        step: p.step,
        status: p.status,
        details: p.details,
        timestamp: p.timestamp.split('T')[1].split('.')[0],
        ...(p.data && { data: p.data })
      })),
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

async function fetchAllRisorEntities() {
  const allEntities: any[] = [];
  let page = 0;
  const pageSize = 1000; // Smaller pages for better progress tracking
  const kommuneNumber = "4201";

  while (true) {
    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=${pageSize}&page=${page}`;
    
    logProgress("API_FETCH", "in_progress", `Fetching page ${page + 1}...`, { url });

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-risor-complete/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const entities = data._embedded?.enheter || [];

    if (entities.length === 0) {
      logProgress("API_FETCH", "in_progress", `No more entities on page ${page + 1}, stopping`);
      break;
    }

    allEntities.push(...entities);
    
    logProgress("API_FETCH", "in_progress", `Page ${page + 1} complete`, {
      entitiesThisPage: entities.length,
      totalSoFar: allEntities.length,
      totalAvailable: data.page?.totalElements || "unknown"
    });

    // Check if we've reached the end or API limit
    const totalPages = data.page?.totalPages || 0;
    if (page >= totalPages - 1 || pageSize * (page + 2) > 10000) {
      logProgress("API_FETCH", "in_progress", `Reached end of available data (API limit or last page)`);
      break;
    }

    page++;
    
    // Rate limiting
    if (page < totalPages) {
      logProgress("API_FETCH", "in_progress", "Waiting 1s before next page (rate limiting)...");
      await delay.betweenBronnøysundCalls();
    }
  }

  return allEntities;
}

async function processEntitiesWithProgress(entities: any[]) {
  let companiesSaved = 0;
  let addressHistoryCreated = 0;
  let postalCodesCollected = 0;
  const batchSize = 50; // Smaller batches for better progress tracking

  // Ensure kommune exists
  logProgress("DATA_PROCESSING", "in_progress", "Setting up Risør kommune in database...");
  
  const kommune = await prisma.kommune.upsert({
    where: { kommuneNumber: "4201" },
    update: {},
    create: {
      kommuneNumber: "4201",
      name: "Risør",
      county: "Agder",
    },
  });

  logProgress("DATA_PROCESSING", "in_progress", "Kommune setup complete", { kommuneId: kommune.id });

  // Process in batches
  const totalBatches = Math.ceil(entities.length / batchSize);
  
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    logProgress("DATA_PROCESSING", "in_progress", `Processing batch ${batchNumber}/${totalBatches}`, {
      entitiesInBatch: batch.length,
      progress: `${Math.round((i / entities.length) * 100)}%`
    });

    try {
      // Process batch
      for (const entity of batch) {
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
        const addressCount = await saveAddressHistory(savedCompany.id, companyData, entity);
        addressHistoryCreated += addressCount;

        // Collect postal codes
        const postalCodes = extractPostalCodes(entity);
        for (const postalCode of postalCodes) {
          await prisma.kommunePostalCode.upsert({
            where: {
              kommuneNumber_postalCode: {
                kommuneNumber: "4201",
                postalCode: postalCode.postalCode,
              },
            },
            update: { city: postalCode.city, isActive: true },
            create: {
              kommuneId: kommune.id,
              kommuneNumber: "4201",
              postalCode: postalCode.postalCode,
              city: postalCode.city,
              isActive: true,
            },
          });
        }
        postalCodesCollected += postalCodes.length;
      }

      logProgress("DATA_PROCESSING", "in_progress", `Batch ${batchNumber} completed`, {
        companiesSaved: batch.length,
        totalProgress: `${Math.round(((i + batch.length) / entities.length) * 100)}%`
      });

    } catch (error) {
      logProgress("DATA_PROCESSING", "error", `Batch ${batchNumber} failed: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }

  return { companiesSaved, addressHistoryCreated, postalCodesCollected };
}

async function saveAddressHistory(companyId: string, companyData: any, originalEntity: any): Promise<number> {
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
    JSON.stringify(originalEntity.postadresse) !== JSON.stringify(originalEntity.forretningsadresse)
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

function extractPostalCodes(entity: any): Array<{postalCode: string, city: string}> {
  const codes: Array<{postalCode: string, city: string}> = [];

  if (entity.forretningsadresse?.postnummer && entity.forretningsadresse?.poststed) {
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

async function verifyDataIntegrity(originalEntities: any[]) {
  logProgress("VERIFICATION", "in_progress", "Counting saved companies...");
  
  const orgNumbers = originalEntities.map(e => e.organisasjonsnummer);
  const companiesInDB = await prisma.company.count({
    where: { organizationNumber: { in: orgNumbers } },
  });

  logProgress("VERIFICATION", "in_progress", "Counting address history records...");
  
  const addressHistoryCount = await prisma.companyAddressHistory.count({
    where: { organizationNumber: { in: orgNumbers } },
  });

  logProgress("VERIFICATION", "in_progress", "Counting postal codes...");
  
  const postalCodeCount = await prisma.kommunePostalCode.count({
    where: { kommuneNumber: "4201" },
  });

  logProgress("VERIFICATION", "in_progress", "Getting sample data...");
  
  const sampleCompany = await prisma.company.findFirst({
    where: { organizationNumber: orgNumbers[0] },
    include: { addressHistory: true },
  });

  const verification = {
    originalEntities: originalEntities.length,
    companiesInDB,
    addressHistoryCount,
    postalCodeCount,
    sampleCompany: sampleCompany ? {
      name: sampleCompany.name,
      organizationNumber: sampleCompany.organizationNumber,
      addressHistoryRecords: sampleCompany.addressHistory.length,
    } : null,
    allDataValid: companiesInDB === originalEntities.length && addressHistoryCount > 0 && postalCodeCount > 0,
  };

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

function calculateRiskScore(entity: any): number {
  let score = 0;
  if (entity.konkurs) score += 50;
  return score;
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    test: "Risør Complete Data Collection",
    description: "Full data collection for Risør with detailed progress tracking",
    usage: "POST to start complete data collection",
    features: [
      "✅ Database integration testing",
      "📊 Real-time progress tracking", 
      "💾 Complete data saving (companies, addresses, postal codes)",
      "🔍 Data integrity verification",
      "⚡ Performance monitoring"
    ],
    timestamp: new Date().toISOString(),
  });
}
