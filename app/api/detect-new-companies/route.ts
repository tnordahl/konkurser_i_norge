import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { kommuneService } from "@/lib/kommune-service";

/**
 * Detect New Companies API
 *
 * Scans for companies that exist in Brønnøysundregistrene but not in our database
 * This ensures we continuously expand our dataset with real companies
 */

interface NewCompanyDetectionResult {
  kommuneNumber: string;
  kommuneName: string;
  newCompaniesFound: number;
  newCompaniesAdded: number;
  totalScanned: number;
  processingTime: number;
  errors: number;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetKommune = searchParams.get("kommune");
    const limit = parseInt(searchParams.get("limit") || "1000");

    console.log("🔍 Starting new company detection...");
    const startTime = Date.now();

    let results: NewCompanyDetectionResult[] = [];

    if (targetKommune) {
      // Scan specific kommune
      const result = await scanKommuneForNewCompanies(targetKommune, limit);
      results = [result];
    } else {
      // Scan all kommuner (limited scope for performance)
      const allKommuner = kommuneService.getAllKommuner();
      const priorityKommuner = allKommuner.slice(0, 10); // Limit to first 10 for performance

      console.log(
        `📍 Scanning ${priorityKommuner.length} priority kommuner for new companies...`
      );

      for (const kommune of priorityKommuner) {
        try {
          const result = await scanKommuneForNewCompanies(
            kommune.number,
            Math.floor(limit / priorityKommuner.length)
          );
          results.push(result);

          // Small delay to avoid overwhelming the API
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`❌ Failed to scan kommune ${kommune.number}:`, error);
          results.push({
            kommuneNumber: kommune.number,
            kommuneName: kommune.name,
            newCompaniesFound: 0,
            newCompaniesAdded: 0,
            totalScanned: 0,
            processingTime: 0,
            errors: 1,
          });
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const summary = {
      totalKommuner: results.length,
      totalNewCompaniesFound: results.reduce(
        (sum, r) => sum + r.newCompaniesFound,
        0
      ),
      totalNewCompaniesAdded: results.reduce(
        (sum, r) => sum + r.newCompaniesAdded,
        0
      ),
      totalScanned: results.reduce((sum, r) => sum + r.totalScanned, 0),
      totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
      processingTime: totalTime,
    };

    console.log("✅ New company detection completed!");
    console.log(
      `📊 Summary: ${summary.totalNewCompaniesFound} new companies found, ${summary.totalNewCompaniesAdded} added`
    );

    return NextResponse.json({
      success: true,
      message: "New company detection completed",
      summary,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ New company detection failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "New company detection failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Scan a specific kommune for new companies
 */
async function scanKommuneForNewCompanies(
  kommuneNumber: string,
  limit: number = 1000
): Promise<NewCompanyDetectionResult> {
  const startTime = Date.now();
  let newCompaniesFound = 0;
  let newCompaniesAdded = 0;
  let totalScanned = 0;
  let errors = 0;

  try {
    const kommune = kommuneService.getKommuneByNumber(kommuneNumber);
    if (!kommune) {
      throw new Error(`Unknown kommune: ${kommuneNumber}`);
    }

    console.log(
      `🔍 Scanning ${kommune.name} (${kommuneNumber}) for new companies...`
    );

    // Get existing organization numbers in our database for this kommune
    const existingOrgNumbers = new Set(
      (
        await prisma.company.findMany({
          where: {
            OR: [
              { currentKommuneId: kommuneNumber },
              { currentKommuneId: kommune.id },
            ],
          },
          select: { organizationNumber: true },
        })
      ).map((c) => c.organizationNumber)
    );

    console.log(
      `📊 Found ${existingOrgNumbers.size} existing companies in database`
    );

    // Fetch companies from Brønnøysundregistrene
    const enhetsregisterUrl =
      "https://data.brreg.no/enhetsregisteret/api/enheter";
    let page = 0;
    let hasMorePages = true;

    while (hasMorePages && totalScanned < limit) {
      const searchParams = new URLSearchParams({
        kommunenummer: kommuneNumber,
        size: "100",
        page: page.toString(),
      });

      const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-new-company-detector/1.0",
        },
      });

      if (!response.ok) {
        console.warn(
          `Failed to fetch page ${page} for kommune ${kommuneNumber}: ${response.status}`
        );
        break;
      }

      const data = await response.json();
      const entities = data._embedded?.enheter || [];

      if (entities.length === 0) {
        hasMorePages = false;
        break;
      }

      // Check each entity to see if it's new
      for (const entity of entities) {
        totalScanned++;

        if (!existingOrgNumbers.has(entity.organisasjonsnummer)) {
          newCompaniesFound++;

          try {
            // Add this new company to our database
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
              businessAddress: formatAddress(entity.forretningsadresse),
              postalAddress: formatAddress(entity.postadresse),
              currentAddress: formatAddress(entity.forretningsadresse),
              currentPostalCode: entity.forretningsadresse?.postnummer,
              currentCity: entity.forretningsadresse?.poststed,
              currentKommuneId: kommuneNumber,
              lastUpdated: new Date(),
            };

            // Create the company
            const savedCompany = await prisma.company.create({
              data: companyData,
            });

            // Create initial address history
            await createInitialAddressHistory(savedCompany.id, entity);

            newCompaniesAdded++;
            console.log(
              `✨ Added new company: ${entity.navn} (${entity.organisasjonsnummer})`
            );
          } catch (error) {
            console.error(
              `❌ Failed to add company ${entity.organisasjonsnummer}:`,
              error
            );
            errors++;
          }
        }

        // Stop if we've reached the limit
        if (totalScanned >= limit) {
          hasMorePages = false;
          break;
        }
      }

      page++;

      // Add small delay between pages
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const processingTime = Date.now() - startTime;

    console.log(`✅ ${kommune.name} scan complete:`);
    console.log(`   - Scanned: ${totalScanned} companies`);
    console.log(`   - New found: ${newCompaniesFound}`);
    console.log(`   - Successfully added: ${newCompaniesAdded}`);
    console.log(`   - Errors: ${errors}`);
    console.log(`   - Time: ${(processingTime / 1000).toFixed(1)}s`);

    return {
      kommuneNumber,
      kommuneName: kommune.name,
      newCompaniesFound,
      newCompaniesAdded,
      totalScanned,
      processingTime,
      errors,
    };
  } catch (error) {
    console.error(`❌ Failed to scan kommune ${kommuneNumber}:`, error);
    return {
      kommuneNumber,
      kommuneName: "Unknown",
      newCompaniesFound: 0,
      newCompaniesAdded: 0,
      totalScanned,
      processingTime: Date.now() - startTime,
      errors: errors + 1,
    };
  }
}

/**
 * Create initial address history for a new company
 */
async function createInitialAddressHistory(
  companyId: string,
  entity: any
): Promise<void> {
  try {
    const histories: any[] = [];

    // Business address
    if (entity.forretningsadresse) {
      histories.push({
        companyId,
        organizationNumber: entity.organisasjonsnummer,
        address: formatAddress(entity.forretningsadresse),
        postalCode: entity.forretningsadresse.postnummer,
        city: entity.forretningsadresse.poststed,
        kommuneNumber: entity.forretningsadresse.kommunenummer,
        kommuneName: entity.forretningsadresse.poststed,
        addressType: "business",
        fromDate: entity.registreringsdatoEnhetsregisteret
          ? new Date(entity.registreringsdatoEnhetsregisteret)
          : new Date(),
        isCurrentAddress: true,
      });
    }

    // Postal address (if different)
    if (
      entity.postadresse &&
      JSON.stringify(entity.postadresse) !==
        JSON.stringify(entity.forretningsadresse)
    ) {
      histories.push({
        companyId,
        organizationNumber: entity.organisasjonsnummer,
        address: formatAddress(entity.postadresse),
        postalCode: entity.postadresse.postnummer,
        city: entity.postadresse.poststed,
        kommuneNumber: entity.postadresse.kommunenummer,
        kommuneName: entity.postadresse.poststed,
        addressType: "postal",
        fromDate: entity.registreringsdatoEnhetsregisteret
          ? new Date(entity.registreringsdatoEnhetsregisteret)
          : new Date(),
        isCurrentAddress: true,
      });
    }

    // Save address histories
    for (const history of histories) {
      await prisma.companyAddressHistory.create({
        data: history,
      });
    }
  } catch (error) {
    console.error("Failed to create initial address history:", error);
  }
}

/**
 * Format address object into a string
 */
function formatAddress(address: any): string {
  if (!address) return "";

  const parts = [
    address.adresse?.[0],
    address.postnummer,
    address.poststed,
  ].filter(Boolean);

  return parts.join(", ");
}

// Also support GET for manual triggers
export async function GET(request: NextRequest) {
  return POST(request);
}
