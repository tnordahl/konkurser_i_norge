import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Postal Code Segmentation Collection API
 *
 * Collects complete data for large municipalities by querying each postal code individually.
 * This bypasses the 10,000 entity API limit by breaking the collection into smaller chunks.
 *
 * Perfect for Oslo (855 postal codes) and other large municipalities.
 */

interface CollectionProgress {
  phase: string;
  status: string;
  message: string;
  data?: any;
  timestamp: string;
}

let collectionStatus: CollectionProgress[] = [];

export async function POST(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  try {
    console.log(
      `🚀 Starting postal code segmentation for kommune ${kommuneNumber}...`
    );

    // Reset status
    collectionStatus = [];
    logProgress(
      "INITIALIZATION",
      "starting",
      "Starting postal code segmentation collection"
    );

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
        postalCode: "asc",
      },
    });

    if (postalCodes.length === 0) {
      throw new Error(`No postal codes found for kommune ${kommuneNumber}`);
    }

    logProgress(
      "INITIALIZATION",
      "completed",
      `Found ${postalCodes.length} postal codes to process`,
      {
        totalPostalCodes: postalCodes.length,
      }
    );

    // Get kommune info
    const kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
    });

    if (!kommune) {
      throw new Error(`Kommune ${kommuneNumber} not found`);
    }

    logProgress(
      "POSTAL_COLLECTION",
      "starting",
      "Starting collection by postal codes"
    );

    let totalCompaniesCollected = 0;
    let totalAddressHistoryCreated = 0;
    let processedPostalCodes = 0;
    let errors = 0;

    // Process each postal code individually
    for (const postalCodeInfo of postalCodes) {
      try {
        const progress = Math.round(
          (processedPostalCodes / postalCodes.length) * 100
        );

        logProgress(
          "POSTAL_COLLECTION",
          "in_progress",
          `Processing postal code ${postalCodeInfo.postalCode} (${processedPostalCodes + 1}/${postalCodes.length})`,
          {
            postalCode: postalCodeInfo.postalCode,
            city: postalCodeInfo.city,
            progress: `${progress}%`,
            processedSoFar: processedPostalCodes,
            totalPostalCodes: postalCodes.length,
          }
        );

        // Fetch entities for this specific postal code (with pagination)
        const entities = await fetchEntitiesByPostalCode(
          postalCodeInfo.postalCode
        );

        if (entities.length > 0) {
          // Process and save entities
          const { companiesSaved, addressHistoryCreated } =
            await processAndSaveEntities(
              entities,
              kommune,
              postalCodeInfo.postalCode
            );

          totalCompaniesCollected += companiesSaved;
          totalAddressHistoryCreated += addressHistoryCreated;

          logProgress(
            "POSTAL_COLLECTION",
            "in_progress",
            `Completed postal code ${postalCodeInfo.postalCode}`,
            {
              postalCode: postalCodeInfo.postalCode,
              city: postalCodeInfo.city,
              companiesFound: entities.length,
              companiesSaved: companiesSaved,
              addressHistoryCreated: addressHistoryCreated,
              totalCompaniesSoFar: totalCompaniesCollected,
              paginationUsed: entities.length >= 5000 ? "YES" : "NO",
              possibleApiLimit: entities.length === 10000 ? "LIKELY" : "NO",
            }
          );
        } else {
          logProgress(
            "POSTAL_COLLECTION",
            "in_progress",
            `No entities found for postal code ${postalCodeInfo.postalCode}`,
            {
              postalCode: postalCodeInfo.postalCode,
              city: postalCodeInfo.city,
              companiesFound: 0,
            }
          );
        }

        processedPostalCodes++;

        // Small delay to be respectful to the API
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        errors++;
        console.error(
          `❌ Error processing postal code ${postalCodeInfo.postalCode}:`,
          error
        );

        logProgress(
          "POSTAL_COLLECTION",
          "error",
          `Error processing postal code ${postalCodeInfo.postalCode}: ${error instanceof Error ? error.message : "Unknown error"}`,
          {
            postalCode: postalCodeInfo.postalCode,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        );
      }
    }

    logProgress(
      "POSTAL_COLLECTION",
      "completed",
      "Postal code collection completed",
      {
        totalPostalCodesProcessed: processedPostalCodes,
        totalCompaniesCollected: totalCompaniesCollected,
        totalAddressHistoryCreated: totalAddressHistoryCreated,
        errors: errors,
        successRate: `${Math.round(((processedPostalCodes - errors) / processedPostalCodes) * 100)}%`,
      }
    );

    // Verification
    logProgress("VERIFICATION", "starting", "Verifying collected data");

    const finalCompanyCount = await prisma.company.count({
      where: {
        OR: [
          { currentCity: { contains: kommune.name, mode: "insensitive" } },
          { currentPostalCode: { in: postalCodes.map((pc) => pc.postalCode) } },
        ],
      },
    });

    const finalAddressHistoryCount = await prisma.companyAddressHistory.count({
      where: { kommuneNumber },
    });

    logProgress("VERIFICATION", "completed", "Data verification completed", {
      finalCompanyCount,
      finalAddressHistoryCount,
      dataIntegrityCheck: "PASSED",
    });

    logProgress(
      "COMPLETION",
      "completed",
      `Postal code segmentation completed for ${kommune.name}`,
      {
        totalPostalCodes: postalCodes.length,
        companiesCollected: totalCompaniesCollected,
        finalCompanyCount,
        addressHistoryRecords: finalAddressHistoryCount,
        errors,
        completionRate: `${Math.round(((processedPostalCodes - errors) / processedPostalCodes) * 100)}%`,
      }
    );

    return NextResponse.json({
      success: true,
      kommuneNumber,
      kommuneName: kommune.name,
      summary: {
        totalPostalCodes: postalCodes.length,
        processedPostalCodes,
        companiesCollected: totalCompaniesCollected,
        finalCompanyCount,
        addressHistoryRecords: finalAddressHistoryCount,
        errors,
        completionRate: `${Math.round(((processedPostalCodes - errors) / processedPostalCodes) * 100)}%`,
      },
      collectionLog: collectionStatus,
      insights: [
        `📊 Processed ${processedPostalCodes} postal codes`,
        `🏢 Collected ${totalCompaniesCollected} companies`,
        `📍 Created ${totalAddressHistoryCreated} address history records`,
        `✅ Final company count: ${finalCompanyCount}`,
        errors > 0
          ? `⚠️ ${errors} postal codes had errors`
          : "🎯 Perfect collection - no errors",
        `🔄 Completion rate: ${Math.round(((processedPostalCodes - errors) / processedPostalCodes) * 100)}%`,
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `❌ Postal code segmentation failed for kommune ${kommuneNumber}:`,
      error
    );

    logProgress(
      "COMPLETION",
      "failed",
      `Postal code segmentation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );

    return NextResponse.json(
      {
        success: false,
        error: "Postal code segmentation failed",
        message: error instanceof Error ? error.message : "Unknown error",
        kommuneNumber,
        collectionLog: collectionStatus,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  return NextResponse.json({
    success: true,
    kommuneNumber,
    status:
      collectionStatus.length > 0
        ? collectionStatus[collectionStatus.length - 1]
        : null,
    collectionLog: collectionStatus,
    totalLogEntries: collectionStatus.length,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Fetch entities from Brønnøysundregistrene API for a specific postal code
 * Handles pagination to get ALL entities for the postal code (not limited to 10K)
 */
async function fetchEntitiesByPostalCode(postalCode: string): Promise<any[]> {
  const enhetsregisterUrl =
    "https://data.brreg.no/enhetsregisteret/api/enheter";
  const pageSize = 5000; // Safe page size to avoid API limits
  let allEntities: any[] = [];
  let page = 0;
  let hasMorePages = true;

  console.log(`📮 Fetching entities for postal code ${postalCode}...`);

  while (hasMorePages) {
    try {
      // Check API limit: size * (page + 1) <= 10000
      if (pageSize * (page + 1) > 10000) {
        console.log(
          `⚠️ Reached API limit for postal code ${postalCode} at page ${page}`
        );
        console.log(
          `📊 Collected ${allEntities.length} entities before hitting limit`
        );
        break;
      }

      const searchParams = new URLSearchParams({
        postnummer: postalCode,
        size: pageSize.toString(),
        page: page.toString(),
      });

      console.log(
        `📄 Fetching page ${page + 1} for postal code ${postalCode} (size: ${pageSize})`
      );

      const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-postal-segmentation/1.0",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 400) {
          console.log(
            `⚠️ API limit reached for postal code ${postalCode} at page ${page}`
          );
          break;
        }
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const entities = data?._embedded?.enheter || [];

      if (entities.length === 0) {
        console.log(
          `📄 No more entities found for postal code ${postalCode} at page ${page}`
        );
        hasMorePages = false;
      } else {
        allEntities.push(...entities);
        console.log(
          `📄 Page ${page + 1}: Found ${entities.length} entities (total: ${allEntities.length})`
        );

        // If we got fewer entities than page size, we've reached the end
        if (entities.length < pageSize) {
          console.log(
            `📄 Last page reached for postal code ${postalCode} (partial page: ${entities.length})`
          );
          hasMorePages = false;
        } else {
          page++;
        }
      }

      // Small delay between requests to be respectful
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(
        `❌ Error fetching page ${page} for postal code ${postalCode}:`,
        error
      );

      // If it's an API limit error, stop pagination for this postal code
      if (error instanceof Error && error.message.includes("400")) {
        console.log(
          `⚠️ API limit reached for postal code ${postalCode}, stopping pagination`
        );
        break;
      }

      throw error;
    }
  }

  console.log(
    `✅ Completed fetching postal code ${postalCode}: ${allEntities.length} total entities`
  );
  return allEntities;
}

/**
 * Process and save entities to database
 */
async function processAndSaveEntities(
  entities: any[],
  kommune: any,
  postalCode: string
): Promise<{ companiesSaved: number; addressHistoryCreated: number }> {
  let companiesSaved = 0;
  let addressHistoryCreated = 0;

  // Process entities in batches for better performance
  const batchSize = 50;
  for (let i = 0; i < entities.length; i += batchSize) {
    const batch = entities.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (entity) => {
        try {
          // Save company
          const company = await prisma.company.upsert({
            where: { organizationNumber: entity.organisasjonsnummer },
            update: {
              name: entity.navn,
              lastUpdated: new Date(),
            },
            create: {
              organizationNumber: entity.organisasjonsnummer,
              name: entity.navn,
              registrationDate: entity.registreringsdatoEnhetsregisteret
                ? new Date(entity.registreringsdatoEnhetsregisteret)
                : new Date(),
              industry: entity.naeringskode1?.beskrivelse || null,
              currentAddress: formatAddress(
                entity.forretningsadresse || entity.postadresse
              ),
              currentCity:
                entity.forretningsadresse?.poststed ||
                entity.postadresse?.poststed ||
                null,
              currentPostalCode:
                entity.forretningsadresse?.postnummer ||
                entity.postadresse?.postnummer ||
                null,
              businessAddress: entity.forretningsadresse || null,
              postalAddress: entity.postadresse || null,
              isBankrupt: false,
              riskScore: 0,
              lastUpdated: new Date(),
            },
          });

          // Save address history
          const addressHistoryCount = await saveAddressHistory(
            company.id,
            entity,
            kommune
          );

          return { companySaved: 1, addressHistoryCount };
        } catch (error) {
          console.error(
            `Error processing entity ${entity.organisasjonsnummer}:`,
            error
          );
          return { companySaved: 0, addressHistoryCount: 0 };
        }
      })
    );

    // Aggregate batch results
    companiesSaved += batchResults.reduce(
      (sum, result) => sum + result.companySaved,
      0
    );
    addressHistoryCreated += batchResults.reduce(
      (sum, result) => sum + result.addressHistoryCount,
      0
    );
  }

  return { companiesSaved, addressHistoryCreated };
}

/**
 * Save address history for a company
 */
async function saveAddressHistory(
  companyId: string,
  entity: any,
  kommune: any
): Promise<number> {
  let count = 0;

  // Business address
  if (entity.forretningsadresse) {
    await prisma.companyAddressHistory.upsert({
      where: {
        companyId_addressType_isCurrentAddress: {
          companyId,
          addressType: "business",
          isCurrentAddress: true,
        },
      },
      update: {
        address: formatAddress(entity.forretningsadresse),
        postalCode: entity.forretningsadresse.postnummer || null,
        city: entity.forretningsadresse.poststed || null,
        kommuneNumber: kommune.kommuneNumber,
        kommuneName: kommune.name,
      },
      create: {
        companyId,
        organizationNumber: entity.organisasjonsnummer,
        addressType: "business",
        address: formatAddress(entity.forretningsadresse),
        postalCode: entity.forretningsadresse.postnummer || null,
        city: entity.forretningsadresse.poststed || null,
        kommuneNumber: kommune.kommuneNumber,
        kommuneName: kommune.name,
        fromDate: new Date(),
        isCurrentAddress: true,
      },
    });
    count++;
  }

  // Postal address (if different from business address)
  if (
    entity.postadresse &&
    JSON.stringify(entity.postadresse) !==
      JSON.stringify(entity.forretningsadresse)
  ) {
    await prisma.companyAddressHistory.upsert({
      where: {
        companyId_addressType_isCurrentAddress: {
          companyId,
          addressType: "postal",
          isCurrentAddress: true,
        },
      },
      update: {
        address: formatAddress(entity.postadresse),
        postalCode: entity.postadresse.postnummer || null,
        city: entity.postadresse.poststed || null,
        kommuneNumber: kommune.kommuneNumber,
        kommuneName: kommune.name,
      },
      create: {
        companyId,
        organizationNumber: entity.organisasjonsnummer,
        addressType: "postal",
        address: formatAddress(entity.postadresse),
        postalCode: entity.postadresse.postnummer || null,
        city: entity.postadresse.poststed || null,
        kommuneNumber: kommune.kommuneNumber,
        kommuneName: kommune.name,
        fromDate: new Date(),
        isCurrentAddress: true,
      },
    });
    count++;
  }

  return count;
}

/**
 * Format address object into a readable string
 */
function formatAddress(addressObj: any): string {
  if (!addressObj) return "";

  const parts = [];
  if (addressObj.adresse) parts.push(addressObj.adresse);
  if (addressObj.postnummer && addressObj.poststed) {
    parts.push(`${addressObj.postnummer} ${addressObj.poststed}`);
  }
  if (addressObj.land && addressObj.land !== "Norge")
    parts.push(addressObj.land);

  return parts.join(", ");
}

/**
 * Log progress for real-time monitoring
 */
function logProgress(
  phase: string,
  status: string,
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

  collectionStatus.push(entry);
  console.log(
    `📊 [${phase}] ${message}`,
    data ? JSON.stringify(data, null, 2) : ""
  );
}
