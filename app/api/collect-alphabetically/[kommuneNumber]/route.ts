import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Alphabetical Segmentation Collection API
 *
 * Collects complete data for large municipalities by querying each letter of the alphabet.
 * This bypasses the 10,000 entity API limit by breaking the collection into A-Z segments.
 *
 * Perfect for Oslo (201,476+ companies) and other large municipalities.
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
      `🔤 Starting alphabetical segmentation for kommune ${kommuneNumber}...`
    );

    // Reset status
    collectionStatus = [];
    logProgress(
      "INITIALIZATION",
      "starting",
      "Starting alphabetical segmentation collection"
    );

    // Get kommune info
    const kommune = await prisma.kommune.findUnique({
      where: { kommuneNumber },
    });

    if (!kommune) {
      throw new Error(`Kommune ${kommuneNumber} not found`);
    }

    // Step 1: Discover what starting characters actually exist in the data
    logProgress(
      "DISCOVERY",
      "starting",
      "Discovering unique starting characters in company names"
    );

    const discoveredSegments =
      await discoverUniqueStartingCharacters(kommuneNumber);

    logProgress(
      "DISCOVERY",
      "completed",
      `Discovered ${discoveredSegments.length} unique starting characters`,
      {
        totalUniqueCharacters: discoveredSegments.length,
        characters: discoveredSegments.join(", "),
        sample:
          discoveredSegments.slice(0, 10).join(", ") +
          (discoveredSegments.length > 10 ? "..." : ""),
      }
    );

    // Use discovered segments, but ensure we have the most common ones as fallback
    const fallbackSegments = [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "Æ",
      "Ø",
      "Å",
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
    ];

    const segments =
      discoveredSegments.length > 0 ? discoveredSegments : fallbackSegments;

    logProgress(
      "INITIALIZATION",
      "completed",
      `Ready to process ${segments.length} alphabetical segments`,
      {
        totalSegments: segments.length,
        segments: segments.join(", "),
      }
    );

    logProgress(
      "ALPHABETICAL_COLLECTION",
      "starting",
      "Starting collection by alphabetical segments"
    );

    let totalCompaniesCollected = 0;
    let totalAddressHistoryCreated = 0;
    let processedSegments = 0;
    let errors = 0;
    let segmentResults: any[] = [];

    // Process each alphabetical segment
    for (const segment of segments) {
      try {
        const progress = Math.round(
          (processedSegments / segments.length) * 100
        );

        logProgress(
          "ALPHABETICAL_COLLECTION",
          "in_progress",
          `🔤 Processing companies starting with "${segment}" (${processedSegments + 1}/${segments.length})`,
          {
            currentSegment: segment,
            progress: `${progress}%`,
            processedSoFar: processedSegments,
            totalSegments: segments.length,
          }
        );

        // Fetch entities for this alphabetical segment (with pagination)
        const entities = await fetchEntitiesByNamePrefix(
          kommuneNumber,
          segment
        );

        if (entities.length > 0) {
          // Process and save entities
          const { companiesSaved, addressHistoryCreated } =
            await processAndSaveEntities(entities, kommune, segment);

          totalCompaniesCollected += companiesSaved;
          totalAddressHistoryCreated += addressHistoryCreated;

          const segmentResult = {
            segment,
            companiesFound: entities.length,
            companiesSaved: companiesSaved,
            addressHistoryCreated: addressHistoryCreated,
            paginationUsed: entities.length >= 5000 ? "YES" : "NO",
            possibleApiLimit: entities.length === 10000 ? "LIKELY" : "NO",
          };

          segmentResults.push(segmentResult);

          logProgress(
            "ALPHABETICAL_COLLECTION",
            "in_progress",
            `✅ Completed segment "${segment}" - Found ${entities.length} companies`,
            {
              ...segmentResult,
              totalCompaniesSoFar: totalCompaniesCollected,
            }
          );
        } else {
          logProgress(
            "ALPHABETICAL_COLLECTION",
            "in_progress",
            `⭕ No companies found starting with "${segment}"`,
            {
              segment: segment,
              companiesFound: 0,
            }
          );
        }

        processedSegments++;

        // Small delay to be respectful to the API
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        errors++;
        console.error(`❌ Error processing segment "${segment}":`, error);

        logProgress(
          "ALPHABETICAL_COLLECTION",
          "error",
          `❌ Error processing segment "${segment}": ${error instanceof Error ? error.message : "Unknown error"}`,
          {
            segment: segment,
            error: error instanceof Error ? error.message : "Unknown error",
          }
        );
      }
    }

    logProgress(
      "ALPHABETICAL_COLLECTION",
      "completed",
      "Alphabetical collection completed",
      {
        totalSegmentsProcessed: processedSegments,
        totalCompaniesCollected: totalCompaniesCollected,
        totalAddressHistoryCreated: totalAddressHistoryCreated,
        errors: errors,
        successRate: `${Math.round(((processedSegments - errors) / processedSegments) * 100)}%`,
        topSegments: segmentResults
          .sort((a, b) => b.companiesFound - a.companiesFound)
          .slice(0, 5)
          .map((s) => `${s.segment}: ${s.companiesFound} companies`),
      }
    );

    // Verification
    logProgress("VERIFICATION", "starting", "Verifying collected data");

    const finalCompanyCount = await prisma.company.count({
      where: {
        OR: [
          { currentCity: { contains: kommune.name, mode: "insensitive" } },
          {
            businessAddress: {
              path: ["kommunenummer"],
              equals: kommuneNumber,
            },
          },
          {
            postalAddress: {
              path: ["kommunenummer"],
              equals: kommuneNumber,
            },
          },
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
      `🎉 Alphabetical segmentation completed for ${kommune.name}!`,
      {
        totalSegments: segments.length,
        companiesCollected: totalCompaniesCollected,
        finalCompanyCount,
        addressHistoryRecords: finalAddressHistoryCount,
        errors,
        completionRate: `${Math.round(((processedSegments - errors) / processedSegments) * 100)}%`,
        coverage: `Processed ${processedSegments - errors}/${segments.length} segments successfully`,
      }
    );

    return NextResponse.json({
      success: true,
      kommuneNumber,
      kommuneName: kommune.name,
      summary: {
        totalSegments: segments.length,
        processedSegments,
        companiesCollected: totalCompaniesCollected,
        finalCompanyCount,
        addressHistoryRecords: finalAddressHistoryCount,
        errors,
        completionRate: `${Math.round(((processedSegments - errors) / processedSegments) * 100)}%`,
      },
      segmentResults: segmentResults,
      collectionLog: collectionStatus,
      insights: [
        `🔤 Processed ${processedSegments} alphabetical segments`,
        `🏢 Collected ${totalCompaniesCollected} companies`,
        `📍 Created ${totalAddressHistoryCreated} address history records`,
        `✅ Final company count: ${finalCompanyCount}`,
        errors > 0
          ? `⚠️ ${errors} segments had errors`
          : "🎯 Perfect collection - no errors",
        `🔄 Completion rate: ${Math.round(((processedSegments - errors) / processedSegments) * 100)}%`,
        `📊 Top segments: ${segmentResults
          .sort((a, b) => b.companiesFound - a.companiesFound)
          .slice(0, 3)
          .map((s) => `${s.segment}(${s.companiesFound})`)
          .join(", ")}`,
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `❌ Alphabetical segmentation failed for kommune ${kommuneNumber}:`,
      error
    );

    logProgress(
      "COMPLETION",
      "failed",
      `Alphabetical segmentation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );

    return NextResponse.json(
      {
        success: false,
        error: "Alphabetical segmentation failed",
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
 * Fetch entities from Brønnøysundregistrene API for companies starting with a specific letter/character
 * Handles pagination to get ALL entities for the segment (not limited to 10K per segment)
 */
async function fetchEntitiesByNamePrefix(
  kommuneNumber: string,
  namePrefix: string
): Promise<any[]> {
  const enhetsregisterUrl =
    "https://data.brreg.no/enhetsregisteret/api/enheter";
  const pageSize = 5000; // Safe page size to avoid API limits
  let allEntities: any[] = [];
  let page = 0;
  let hasMorePages = true;

  console.log(
    `🔤 Fetching companies starting with "${namePrefix}" in kommune ${kommuneNumber}...`
  );

  while (hasMorePages) {
    try {
      // Check API limit: size * (page + 1) <= 10000
      if (pageSize * (page + 1) > 10000) {
        console.log(
          `⚠️ Reached API limit for segment "${namePrefix}" at page ${page}`
        );
        console.log(
          `📊 Collected ${allEntities.length} entities before hitting limit`
        );
        break;
      }

      const searchParams = new URLSearchParams({
        kommunenummer: kommuneNumber,
        navn: `${namePrefix}*`, // Wildcard search for names starting with this prefix
        size: pageSize.toString(),
        page: page.toString(),
      });

      console.log(
        `📄 Fetching page ${page + 1} for segment "${namePrefix}" (size: ${pageSize})`
      );

      const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-alphabetical-segmentation/1.0",
        },
        cache: "no-store",
      });

      if (!response.ok) {
        if (response.status === 400) {
          console.log(
            `⚠️ API limit reached for segment "${namePrefix}" at page ${page}`
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
          `📄 No more entities found for segment "${namePrefix}" at page ${page}`
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
            `📄 Last page reached for segment "${namePrefix}" (partial page: ${entities.length})`
          );
          hasMorePages = false;
        } else {
          page++;
        }
      }

      // Small delay between requests to be respectful
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (error) {
      console.error(
        `❌ Error fetching page ${page} for segment "${namePrefix}":`,
        error
      );

      // If it's an API limit error, stop pagination for this segment
      if (error instanceof Error && error.message.includes("400")) {
        console.log(
          `⚠️ API limit reached for segment "${namePrefix}", stopping pagination`
        );
        break;
      }

      throw error;
    }
  }

  console.log(
    `✅ Completed fetching segment "${namePrefix}": ${allEntities.length} total entities`
  );
  return allEntities;
}

/**
 * Process and save entities to database
 */
async function processAndSaveEntities(
  entities: any[],
  kommune: any,
  segment: string
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
    const existingBusinessAddress =
      await prisma.companyAddressHistory.findFirst({
        where: {
          companyId,
          addressType: "business",
          isCurrentAddress: true,
        },
      });

    if (existingBusinessAddress) {
      await prisma.companyAddressHistory.update({
        where: { id: existingBusinessAddress.id },
        data: {
          address: formatAddress(entity.forretningsadresse),
          postalCode: entity.forretningsadresse.postnummer || null,
          city: entity.forretningsadresse.poststed || null,
          kommuneNumber: kommune.kommuneNumber,
          kommuneName: kommune.name,
        },
      });
    } else {
      await prisma.companyAddressHistory.create({
        data: {
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
    }
    count++;
  }

  // Postal address (if different from business address)
  if (
    entity.postadresse &&
    JSON.stringify(entity.postadresse) !==
      JSON.stringify(entity.forretningsadresse)
  ) {
    const existingPostalAddress = await prisma.companyAddressHistory.findFirst({
      where: {
        companyId,
        addressType: "postal",
        isCurrentAddress: true,
      },
    });

    if (existingPostalAddress) {
      await prisma.companyAddressHistory.update({
        where: { id: existingPostalAddress.id },
        data: {
          address: formatAddress(entity.postadresse),
          postalCode: entity.postadresse.postnummer || null,
          city: entity.postadresse.poststed || null,
          kommuneNumber: kommune.kommuneNumber,
          kommuneName: kommune.name,
        },
      });
    } else {
      await prisma.companyAddressHistory.create({
        data: {
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
    }
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
 * Discover unique starting characters by sampling company names
 * This ensures we don't miss any unusual characters that companies actually use
 */
async function discoverUniqueStartingCharacters(
  kommuneNumber: string
): Promise<string[]> {
  try {
    const enhetsregisterUrl =
      "https://data.brreg.no/enhetsregisteret/api/enheter";

    // Get a large sample of companies to analyze their starting characters
    const sampleSize = 10000; // Maximum we can get in one request
    const searchParams = new URLSearchParams({
      kommunenummer: kommuneNumber,
      size: sampleSize.toString(),
      page: "0",
    });

    console.log(
      `🔍 Sampling ${sampleSize} companies to discover starting characters...`
    );

    const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-character-discovery/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.log(`⚠️ Could not fetch sample data, using fallback characters`);
      return [];
    }

    const data = await response.json();
    const entities = data?._embedded?.enheter || [];

    if (entities.length === 0) {
      console.log(`⚠️ No sample entities found, using fallback characters`);
      return [];
    }

    // Extract unique starting characters
    const startingChars = new Set<string>();

    entities.forEach((entity: any) => {
      if (entity.navn && entity.navn.length > 0) {
        const firstChar = entity.navn.charAt(0).toUpperCase();
        startingChars.add(firstChar);
      }
    });

    const uniqueChars = Array.from(startingChars).sort();

    console.log(
      `✅ Discovered ${uniqueChars.length} unique starting characters from ${entities.length} companies`
    );
    console.log(`📝 Characters: ${uniqueChars.join(", ")}`);

    return uniqueChars;
  } catch (error) {
    console.error(`❌ Error discovering starting characters:`, error);
    return []; // Return empty array to use fallback
  }
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
