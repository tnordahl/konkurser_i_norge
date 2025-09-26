import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { detectEscapedCompanies } from "@/lib/generic-fraud-detector";

/**
 * Search for bankruptcies of companies that previously had addresses in this kommune
 * This catches "escaped bankruptcies" - fraud cases where companies moved out before bankruptcy
 */
async function findEscapedBankruptcies(kommuneNumber: string) {
  try {
    console.log(
      `🔍 Searching for escaped bankruptcies from kommune ${kommuneNumber}...`
    );

    // Search the Brønnøysundregistrene API for bankruptcies across all kommuner
    // Then check if any of those companies previously had addresses in our target kommune
    const enhetsregisterUrl =
      "https://data.brreg.no/enhetsregisteret/api/enheter";

    const searchParams = new URLSearchParams({
      size: "2000", // Large search to catch bankruptcies across Norway
      page: "0",
    });

    const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-fraud-detection/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    const escapedBankruptcies = [];

    // Generic escaped company detection - no hardcoded cases
    // This will be populated by the generic fraud detection system

    if (data?._embedded?.enheter) {
      for (const enhet of data._embedded.enheter) {
        // Check if this is a bankruptcy
        const isBankrupt =
          enhet.navn?.toLowerCase().includes("konkursbo") ||
          enhet.navn?.toLowerCase().includes("konkurs") ||
          enhet.slettedato ||
          enhet.organisasjonsform?.kode === "KONKURS";

        if (isBankrupt && enhet.organisasjonsnummer) {
          // For each bankruptcy, check if it previously had an address in our kommune
          try {
            const detailUrl = `https://data.brreg.no/enhetsregisteret/api/enheter/${enhet.organisasjonsnummer}`;
            const detailResponse = await fetch(detailUrl, {
              headers: { Accept: "application/json" },
              cache: "no-store",
            });

            if (detailResponse.ok) {
              const companyData = await detailResponse.json();

              // Check if current address is DIFFERENT from our target kommune
              const currentKommune =
                companyData.forretningsadresse?.kommunenummer;

              // Check if postal address suggests they were in our kommune before
              const postKommune = companyData.postadresse?.kommunenummer;

              // ENHANCED FRAUD DETECTION LOGIC:
              // Use kommunenummer and postal codes for precise detection
              const targetPostalCodes = getKommunePostalCodes(kommuneNumber);
              let hasConnectionToTargetKommune = false;
              let connectionType = "";

              // Check postal address kommunenummer
              if (postKommune === kommuneNumber) {
                hasConnectionToTargetKommune = true;
                connectionType = "POSTAL_KOMMUNENUMMER";
              }

              // Check postal codes
              if (
                companyData.postadresse?.postnummer &&
                targetPostalCodes.includes(companyData.postadresse.postnummer)
              ) {
                hasConnectionToTargetKommune = true;
                connectionType = connectionType
                  ? `${connectionType} + POSTAL_CODE`
                  : "POSTAL_CODE";
              }

              // Check for postal code references in any address data
              if (!hasConnectionToTargetKommune) {
                const allAddressData =
                  JSON.stringify(companyData).toLowerCase();
                const hasPostalCodeRef = targetPostalCodes.some((code) =>
                  allAddressData.includes(code)
                );
                if (hasPostalCodeRef) {
                  hasConnectionToTargetKommune = true;
                  connectionType = "POSTAL_CODE_REFERENCE";
                }
              }

              if (
                currentKommune !== kommuneNumber &&
                hasConnectionToTargetKommune
              ) {
                console.log(
                  `🚨 ESCAPED BANKRUPTCY DETECTED: ${enhet.navn} - moved out of ${kommuneNumber} before bankruptcy!`
                );

                escapedBankruptcies.push({
                  companyName: enhet.navn,
                  organizationNumber: enhet.organisasjonsnummer,
                  bankruptcyDate:
                    enhet.slettedato || enhet.registreringsdatoEnhetsregisteret,
                  currentAddress: formatAddress(companyData.forretningsadresse),
                  previousAddress: formatAddress(companyData.postadresse),
                  currentKommune: currentKommune,
                  previousKommune: kommuneNumber,
                  industry:
                    enhet.naeringskode1?.beskrivelse || "Ukjent bransje",
                  fraudType: "ESCAPED_BANKRUPTCY",
                  alertLevel: "CRITICAL",
                });
              }
            }

            // Small delay to avoid overwhelming API
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (error) {
            // Continue with next company if one fails
            console.warn(
              `Could not check history for ${enhet.organisasjonsnummer}:`,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      }
    }

    return escapedBankruptcies;
  } catch (error) {
    console.error("Failed to find escaped bankruptcies:", error);
    return [];
  }
}

/**
 * Find companies that recently moved OUT of the kommune (early warning system)
 */
async function findRecentlyMovedCompanies(kommuneNumber: string) {
  try {
    console.log(
      `⚠️ Searching for companies that recently moved OUT of kommune ${kommuneNumber}...`
    );

    // This is a simplified implementation - in reality you'd need historical data
    // For now, we'll identify companies with suspicious address patterns
    const enhetsregisterUrl =
      "https://data.brreg.no/enhetsregisteret/api/enheter";

    const searchParams = new URLSearchParams({
      size: "1000",
      page: "0",
    });

    const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-early-warning/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const suspiciousMovers = [];

    if (data?._embedded?.enheter) {
      for (const enhet of data._embedded.enheter) {
        // Skip if already bankrupt
        if (enhet.navn?.toLowerCase().includes("konkurs") || enhet.slettedato) {
          continue;
        }

        // Look for companies with address mismatches (potential recent movers)
        if (
          enhet.organisasjonsnummer &&
          enhet.forretningsadresse &&
          enhet.postadresse
        ) {
          const businessKommune = enhet.forretningsadresse.kommunenummer;
          const postKommune = enhet.postadresse.kommunenummer;

          // EARLY WARNING LOGIC:
          // If postal address is in our kommune but business address is elsewhere,
          // this could indicate a recent move (potential future bankruptcy risk)
          if (
            postKommune === kommuneNumber &&
            businessKommune !== kommuneNumber
          ) {
            console.log(
              `⚠️ EARLY WARNING: ${enhet.navn} - may have moved out of ${kommuneNumber} recently`
            );

            suspiciousMovers.push({
              companyName: enhet.navn,
              organizationNumber: enhet.organisasjonsnummer,
              currentAddress: formatAddress(enhet.forretningsadresse),
              previousAddress: formatAddress(enhet.postadresse),
              currentKommune: businessKommune,
              previousKommune: kommuneNumber,
              industry: enhet.naeringskode1?.beskrivelse || "Ukjent bransje",
              registrationDate: enhet.registreringsdatoEnhetsregisteret,
              fraudType: "SUSPICIOUS_MOVE",
              alertLevel: "MEDIUM",
              riskIndicator: "POTENTIAL_FUTURE_BANKRUPTCY",
            });
          }
        }
      }
    }

    return suspiciousMovers.slice(0, 20); // Limit to most relevant cases
  } catch (error) {
    console.error("Failed to find recently moved companies:", error);
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

  try {
    console.log(
      `🔍 Starting comprehensive fraud monitoring for kommune ${kommuneNumber}...`
    );

    // Get current bankruptcies in the kommune (from our database)
    const currentBankruptcies = await prisma.bankruptcy.findMany({
      where: {
        kommune: {
          kommuneNumber: kommuneNumber,
        },
      },
      include: {
        kommune: {
          select: {
            name: true,
            kommuneNumber: true,
            county: true,
          },
        },
      },
      orderBy: {
        bankruptcyDate: "desc",
      },
    });

    // Find escaped bankruptcies using generic detection (same as address-change-scanner)
    const detectedPatterns = await detectEscapedCompanies(kommuneNumber);

    // Convert to legacy format for compatibility
    const escapedBankruptcies = detectedPatterns.map((pattern) => ({
      companyName: pattern.companyName,
      organizationNumber: pattern.organizationNumber,
      bankruptcyDate: "Pattern detected - Investigation required",
      currentAddress: `${pattern.currentAddress.kommuneName} (${pattern.currentAddress.kommuneNumber})`,
      previousKommune: pattern.suspectedOriginKommune.kommuneName,
      currentKommune: pattern.currentAddress.kommuneName,
      connectionType: pattern.detectionMethod,
      riskLevel: pattern.riskLevel,
      fraudType: "ESCAPED_BEFORE_TROUBLE",
      alertLevel: pattern.riskLevel,
      confidence: pattern.confidence,
      fraudIndicators: pattern.fraudIndicators,
      riskScore:
        pattern.riskLevel === "CRITICAL"
          ? 100
          : pattern.riskLevel === "HIGH"
            ? 80
            : 60,
    }));

    // Find recently moved companies (early warning)
    const recentMovers = await findRecentlyMovedCompanies(kommuneNumber);

    // Format current bankruptcies
    const formattedCurrent = currentBankruptcies.map((b) => ({
      ...b,
      bankruptcyDate: b.bankruptcyDate.toISOString().split("T")[0],
      fraudType: "CURRENT_BANKRUPTCY",
      alertLevel: b.hasRecentAddressChange ? "HIGH" : "LOW",
    }));

    const totalAlerts = escapedBankruptcies.length + recentMovers.length;
    // Calculate fraud risk based on pattern detection results
    const criticalPatterns = detectedPatterns.filter(
      (p) => p.riskLevel === "CRITICAL"
    ).length;
    const highPatterns = detectedPatterns.filter(
      (p) => p.riskLevel === "HIGH"
    ).length;

    const fraudRiskLevel =
      criticalPatterns > 0
        ? "CRITICAL"
        : highPatterns > 0
          ? "HIGH"
          : totalAlerts > 0
            ? "MEDIUM"
            : "LOW";

    console.log(`✅ Comprehensive monitoring complete for ${kommuneNumber}:`);
    console.log(`   📍 Current bankruptcies: ${formattedCurrent.length}`);
    console.log(`   🚨 Escaped bankruptcies: ${escapedBankruptcies.length}`);
    console.log(`   ⚠️  Early warning cases: ${recentMovers.length}`);
    console.log(`   🎯 Overall fraud risk: ${fraudRiskLevel}`);

    return NextResponse.json({
      success: true,
      kommuneNumber,
      kommuneName: getKommuneName(kommuneNumber),
      monitoring: {
        currentBankruptcies: {
          count: formattedCurrent.length,
          data: formattedCurrent,
          description:
            "Companies currently registered in this kommune that have gone bankrupt",
        },
        escapedBankruptcies: {
          count: escapedBankruptcies.length,
          data: escapedBankruptcies,
          description:
            "Companies that moved OUT of this kommune before going bankrupt (fraud detection)",
        },
        earlyWarning: {
          count: recentMovers.length,
          data: recentMovers,
          description:
            "Companies that recently moved out - potential future bankruptcy risk",
        },
      },
      summary: {
        totalCases:
          formattedCurrent.length +
          escapedBankruptcies.length +
          recentMovers.length,
        fraudAlerts: escapedBankruptcies.length + recentMovers.length,
        fraudRiskLevel,
        recommendations:
          fraudRiskLevel === "CRITICAL"
            ? [
                "Immediate investigation recommended",
                "Review all escaped bankruptcy cases",
                "Monitor early warning companies closely",
              ]
            : fraudRiskLevel === "HIGH"
              ? [
                  "Enhanced monitoring recommended",
                  "Review escaped bankruptcies",
                ]
              : ["Continue regular monitoring"],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      `❌ Comprehensive monitoring failed for kommune ${kommuneNumber}:`,
      error
    );
    return NextResponse.json(
      {
        success: false,
        error: "Comprehensive monitoring failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
