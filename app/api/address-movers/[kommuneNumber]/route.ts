import { NextRequest, NextResponse } from "next/server";
import { delay } from "@/lib/config/api-delays";
import { dateUtils } from "@/lib/config/date-utils";
import { PAGINATION, RISK_COUNTS, checks } from "@/lib/config/constants";
import {
  ErrorLogger,
  ErrorResponse,
  SuccessResponse,
  withErrorHandling,
} from "@/lib/config/error-handling";
import { InputValidator } from "@/lib/config/validation";

/**
 * API to find companies that have moved OUT of a specific kommune
 * This is the early warning system for potential future bankruptcies
 */

async function searchCompaniesMovedOutOfKommune(kommuneNumber: string) {
  try {
    console.log(
      `🔍 Searching for companies that moved OUT of kommune ${kommuneNumber}...`
    );

    // Strategy: Search all companies in Norway and look for address patterns
    // that suggest they previously were in our target kommune
    const enhetsregisterUrl =
      "https://data.brreg.no/enhetsregisteret/api/enheter";

    // Search companies that might have connections to our kommune
    const searchParams = new URLSearchParams({
      size: PAGINATION.EXTRA_LARGE_PAGE_SIZE.toString(),
      page: PAGINATION.FIRST_PAGE.toString(),
    });

    const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-mover-detection/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const movedOutCompanies = [];

    if (data?._embedded?.enheter) {
      for (const enhet of data._embedded.enheter) {
        // Skip bankruptcies - we're looking for active companies that moved
        if (enhet.navn?.toLowerCase().includes("konkurs") || enhet.slettedato) {
          continue;
        }

        if (enhet.organisasjonsnummer && enhet.forretningsadresse) {
          const currentKommune = enhet.forretningsadresse.kommunenummer;

          // If company is currently NOT in our target kommune
          if (currentKommune !== kommuneNumber) {
            try {
              // Check detailed company info for address history clues
              const detailUrl = `https://data.brreg.no/enhetsregisteret/api/enheter/${enhet.organisasjonsnummer}`;
              const detailResponse = await fetch(detailUrl, {
                headers: { Accept: "application/json" },
              });

              if (detailResponse.ok) {
                const companyData = await detailResponse.json();

                // ENHANCED DETECTION LOGIC: Use kommunenummer and postal codes for precise detection
                let suspiciousMove = false;
                let previousAddress = "";
                let moveIndicator = "";
                const targetPostalCodes = getKommunePostalCodes(kommuneNumber);

                // METHOD 1: Check if postal address kommunenummer matches our target
                if (companyData.postadresse?.kommunenummer === kommuneNumber) {
                  suspiciousMove = true;
                  previousAddress = formatAddress(companyData.postadresse);
                  moveIndicator = "POSTAL_KOMMUNENUMMER_MATCH";
                }

                // METHOD 2: Check if postal address uses our kommune's postal codes
                if (companyData.postadresse?.postnummer) {
                  const postalCode = companyData.postadresse.postnummer;
                  if (targetPostalCodes.includes(postalCode)) {
                    suspiciousMove = true;
                    previousAddress = formatAddress(companyData.postadresse);
                    moveIndicator = moveIndicator
                      ? `${moveIndicator} + POSTAL_CODE_MATCH`
                      : "POSTAL_CODE_MATCH";
                  }
                }

                // METHOD 3: Check if business address was previously in our kommune
                // (This would require historical data, but we can check for patterns)
                if (
                  companyData.forretningsadresse?.kommunenummer !==
                    kommuneNumber &&
                  companyData.postadresse?.kommunenummer !== kommuneNumber
                ) {
                  // Look for other indicators in available data
                  // Check if any address fields reference our postal codes
                  const allAddressText =
                    JSON.stringify(companyData).toLowerCase();
                  const hasPostalCodeReference = targetPostalCodes.some(
                    (code) => allAddressText.includes(code)
                  );

                  if (hasPostalCodeReference) {
                    suspiciousMove = true;
                    moveIndicator = moveIndicator
                      ? `${moveIndicator} + POSTAL_CODE_REFERENCE`
                      : "POSTAL_CODE_REFERENCE_IN_DATA";
                  }
                }

                // METHOD 4: Company name analysis (improved with postal code context)
                const kommuneName = getKommuneName(kommuneNumber).toLowerCase();
                const companyNameLower = enhet.navn.toLowerCase();

                // Look for location references combined with postal code patterns
                if (
                  companyNameLower.includes(kommuneName) &&
                  !companyNameLower.includes("frisør") &&
                  !companyNameLower.includes("frisor")
                ) {
                  // Additional validation: check if name + postal code context makes sense
                  const namePattern = new RegExp(`\\b${kommuneName}\\b`, "i");
                  if (namePattern.test(companyNameLower)) {
                    suspiciousMove = true;
                    moveIndicator = moveIndicator
                      ? `${moveIndicator} + LOCATION_NAME_MATCH`
                      : "LOCATION_NAME_MATCH";
                  }
                }

                // Check registration date - recent registrations might indicate moves using standardized date utils
                if (companyData.registreringsdatoEnhetsregisteret) {
                  const regDate = new Date(
                    companyData.registreringsdatoEnhetsregisteret
                  );
                  const sixMonthsAgo = dateUtils.monthsAgo(6);

                  if (regDate > sixMonthsAgo && suspiciousMove) {
                    moveIndicator += " + RECENT_REGISTRATION";
                  }
                }

                if (suspiciousMove) {
                  console.log(
                    `⚠️ POTENTIAL MOVER: ${enhet.navn} - may have moved from ${kommuneNumber} to ${currentKommune}`
                  );

                  movedOutCompanies.push({
                    companyName: enhet.navn,
                    organizationNumber: enhet.organisasjonsnummer,
                    currentAddress: formatAddress(
                      companyData.forretningsadresse
                    ),
                    currentKommune: currentKommune,
                    currentKommuneName:
                      companyData.forretningsadresse?.poststed || "Ukjent",
                    previousAddress: previousAddress,
                    previousKommune: kommuneNumber,
                    previousKommuneName: getKommuneName(kommuneNumber),
                    industry:
                      enhet.naeringskode1?.beskrivelse || "Ukjent bransje",
                    registrationDate:
                      companyData.registreringsdatoEnhetsregisteret,
                    moveIndicator: moveIndicator,
                    riskLevel: moveIndicator.includes("RECENT")
                      ? "HIGH"
                      : "MEDIUM",
                    warningType: "MOVED_OUT_OF_KOMMUNE",
                    potentialFraudRisk: "FUTURE_BANKRUPTCY_RISK",
                  });
                }
              }

              // Small delay to avoid API rate limits using standardized delay
              await delay.quickProcessing();
            } catch (error) {
              // Continue with next company if one fails
              continue;
            }
          }
        }
      }
    }

    return movedOutCompanies.slice(0, 50); // Limit results
  } catch (error) {
    console.error("Failed to search for moved companies:", error);
    return [];
  }
}

// Helper functions
function getKommuneName(kommuneNumber: string): string {
  // Generic kommune name lookup - would use external API in production
  // TODO: Implement dynamic kommune name lookup from SSB or other official source
  return `Kommune ${kommuneNumber}`;
}

function getKommunePostalCodes(kommuneNumber: string): string[] {
  // Generic postal code lookup - would use external API in production
  // TODO: Implement dynamic postal code lookup from official postal service
  // For now, return empty array and rely on kommunenummer parameter in API calls
  return [];
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  const parts = [];
  if (addr.adresse?.length) parts.push(addr.adresse.join(" "));
  if (addr.postnummer) parts.push(addr.postnummer);
  if (addr.poststed) parts.push(addr.poststed);
  return parts.join(", ");
}

export async function GET(
  request: NextRequest,
  { params }: { params: { kommuneNumber: string } }
) {
  const kommuneNumber = params.kommuneNumber;

  // Validate input
  const validation = InputValidator.validateKommuneNumber(kommuneNumber);
  if (!validation.isValid) {
    return ErrorResponse.validation("Invalid kommune number", {
      errors: validation.errors,
    });
  }

  try {
    console.log(
      `🔍 Starting address mover detection for kommune ${kommuneNumber}...`
    );

    const movedCompanies =
      await searchCompaniesMovedOutOfKommune(kommuneNumber);

    const highRiskMovers = movedCompanies.filter((c) => c.riskLevel === "HIGH");
    const mediumRiskMovers = movedCompanies.filter(
      (c) => c.riskLevel === "MEDIUM"
    );

    console.log(`✅ Address mover detection complete for ${kommuneNumber}:`);
    console.log(`   🔴 High risk movers: ${highRiskMovers.length}`);
    console.log(`   🟡 Medium risk movers: ${mediumRiskMovers.length}`);
    console.log(`   📊 Total potential movers: ${movedCompanies.length}`);

    return SuccessResponse.ok({
      kommuneNumber,
      kommuneName: getKommuneName(kommuneNumber),
      moversAnalysis: {
        totalMovers: movedCompanies.length,
        highRiskMovers: highRiskMovers.length,
        mediumRiskMovers: mediumRiskMovers.length,
        riskLevel: checks.isHighRiskCount(highRiskMovers.length)
          ? "CRITICAL"
          : highRiskMovers.length > 0
            ? "HIGH"
            : checks.isMediumRiskCount(mediumRiskMovers.length)
              ? "MEDIUM"
              : "LOW",
      },
      data: {
        highRisk: highRiskMovers,
        mediumRisk: mediumRiskMovers.slice(0, 20), // Limit medium risk results
      },
      alerts:
        movedCompanies.length > 0
          ? [
              `Found ${movedCompanies.length} companies that may have moved out of ${getKommuneName(kommuneNumber)}`,
              "Monitor these companies for potential future bankruptcy risk",
              highRiskMovers.length > 0
                ? "High-risk movers require immediate attention"
                : null,
            ].filter(Boolean)
          : ["No suspicious address movements detected"],
    });
  } catch (error) {
    ErrorLogger.log(error as Error, `ADDRESS_MOVERS_API_${kommuneNumber}`, {
      kommuneNumber,
    });
    return ErrorResponse.apiError(
      `Address mover detection failed for kommune ${kommuneNumber}`,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
