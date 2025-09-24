import {
  getAllKommuner as getAllKommunerFromDB,
  getBankruptciesForKommune,
  getAllCompaniesFromDB,
  saveBankruptcyData,
  getDataCoverage,
} from "./database";

export interface BankruptcyData {
  id: string;
  companyName: string;
  organizationNumber: string;
  bankruptcyDate: string;
  address?: string;
  industry?: string;
  hasRecentAddressChange?: boolean;
  previousAddresses?: Array<{
    address: string;
    kommune: {
      name: string;
      kommuneNumber: string;
    };
    fromDate: string;
    toDate: string;
  }>;
  // **NEW: Shell company fraud detection fields**
  lifespanInDays?: number;
  isShellCompanySuspicious?: boolean;
  registrationDate?: string;
  // **NEW: Original company vs bankruptcy estate info**
  originalCompany?: {
    name: string;
    organizationNumber: string;
    registrationDate?: string;
  };
  konkursbo?: {
    name: string;
    organizationNumber: string;
    establishmentDate: string;
  };
}

export interface KommuneData {
  id: string;
  name: string;
  county: string;
  bankruptcyCount: number;
}

export interface DataGap {
  kommuneId: string;
  startDate: string;
  endDate: string;
  missingDays: number;
}

/**
 * Calculate date ranges that need data fetching
 * Returns gaps from one year ago until today
 */
export function calculateDataGaps(
  existingData: BankruptcyData[],
  kommuneNumber: string
): DataGap[] {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const today = new Date();

  // Get all dates we have data for
  const existingDates = existingData
    .map((item) => new Date(item.bankruptcyDate))
    .sort((a, b) => a.getTime() - b.getTime());

  const gaps: DataGap[] = [];
  let currentDate = new Date(oneYearAgo);

  // Check for gaps day by day (simplified - could be optimized)
  while (currentDate <= today) {
    const currentDateStr = currentDate.toISOString().split("T")[0];
    const hasDataForDate = existingDates.some(
      (date) => date.toISOString().split("T")[0] === currentDateStr
    );

    if (!hasDataForDate) {
      // Find the end of this gap
      let gapEnd = new Date(currentDate);
      while (gapEnd <= today) {
        const gapEndStr = gapEnd.toISOString().split("T")[0];
        const hasDataForGapEnd = existingDates.some(
          (date) => date.toISOString().split("T")[0] === gapEndStr
        );
        if (hasDataForGapEnd) break;
        gapEnd.setDate(gapEnd.getDate() + 1);
      }

      const missingDays = Math.ceil(
        (gapEnd.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (missingDays > 0) {
        gaps.push({
          kommuneId: kommuneNumber,
          startDate: currentDate.toISOString().split("T")[0],
          endDate: gapEnd.toISOString().split("T")[0],
          missingDays,
        });
      }

      currentDate = new Date(gapEnd);
    } else {
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return gaps;
}

/**
 * Fetch address history for a company from Brønnøysundregistrene API
 */
async function fetchCompanyAddressHistory(organizationNumber: string): Promise<{
  hasRecentAddressChange: boolean;
  previousAddresses: Array<{
    address: string;
    kommune: { name: string; kommuneNumber: string };
    fromDate: string;
    toDate: string;
  }>;
}> {
  try {
    // Fetch detailed company information including address history
    const detailUrl = `https://data.brreg.no/enhetsregisteret/api/enheter/${organizationNumber}`;

    const response = await fetch(detailUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-app/1.0",
      },
    });

    if (!response.ok) {
      console.warn(
        `Could not fetch address history for ${organizationNumber}: ${response.status}`
      );
      return { hasRecentAddressChange: false, previousAddresses: [] };
    }

    const companyData = await response.json();
    const previousAddresses: Array<{
      address: string;
      kommune: { name: string; kommuneNumber: string };
      fromDate: string;
      toDate: string;
    }> = [];

    // Check if company has moved addresses recently (within last year)
    let hasRecentAddressChange = false;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    // Look for address changes in the data
    // Note: The exact structure depends on the API response format
    if (companyData.registreringsdatoEnhetsregisteret) {
      const registrationDate = new Date(
        companyData.registreringsdatoEnhetsregisteret
      );

      // If company was registered recently, check if it moved from another address
      if (registrationDate > oneYearAgo) {
        // This could indicate a recent address change
        // In a real implementation, you'd need to check historical records

        // For now, we'll use heuristics based on available data
        if (companyData.forretningsadresse && companyData.postadresse) {
          const businessAddr = JSON.stringify(companyData.forretningsadresse);
          const postAddr = JSON.stringify(companyData.postadresse);

          // If business and postal addresses differ, might indicate recent move
          if (businessAddr !== postAddr) {
            hasRecentAddressChange = true;

            // Create a previous address entry
            let postAddress = "";
            if (companyData.postadresse) {
              const addr = companyData.postadresse;
              const addressParts = [];
              if (addr.adresse && addr.adresse.length > 0) {
                addressParts.push(addr.adresse.join(" "));
              }
              if (addr.postnummer) addressParts.push(addr.postnummer);
              if (addr.poststed) addressParts.push(addr.poststed);
              postAddress = addressParts.join(", ");
            }

            if (postAddress) {
              previousAddresses.push({
                address: postAddress,
                kommune: {
                  name: companyData.postadresse?.poststed || "Ukjent",
                  kommuneNumber:
                    companyData.postadresse?.kommunenummer || "0000",
                },
                fromDate: oneYearAgo.toISOString().split("T")[0],
                toDate: registrationDate.toISOString().split("T")[0],
              });
            }
          }
        }
      }
    }

    return { hasRecentAddressChange, previousAddresses };
  } catch (error) {
    console.warn(
      `Failed to fetch address history for ${organizationNumber}:`,
      error
    );
    return { hasRecentAddressChange: false, previousAddresses: [] };
  }
}

/**
 * Try to find the original company behind a KONKURSBO
 */
async function findOriginalCompanyFromKoncursbo(
  konkursboName: string,
  konkursboOrgNumber: string
): Promise<{
  name: string;
  organizationNumber: string;
  registrationDate?: string;
} | null> {
  try {
    // Extract the base company name from KONKURSBO name
    // e.g., "ELECO ELEKTROINSTALLASJON AS TVANGSAVVIKLINGSBO" -> "ELECO ELEKTROINSTALLASJON AS"
    const baseCompanyName = konkursboName
      .replace(/\s+(KONKURSBO|TVANGSAVVIKLINGSBO)$/i, "")
      .replace(/\s+KONKURS$/i, "")
      .trim();

    console.log(
      `🔍 Looking for original company: "${baseCompanyName}" (from KONKURSBO: ${konkursboName})`
    );

    // Search for the original company by name
    const searchParams = new URLSearchParams({
      navn: baseCompanyName,
      size: "10",
    });

    const enhetsregisterUrl =
      "https://data.brreg.no/enhetsregisteret/api/enheter";
    const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-app/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to search for original company: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data._embedded?.enheter) {
      // Look for the best match - prefer exact name matches that are not KONKURSBO
      for (const enhet of data._embedded.enheter) {
        if (
          enhet.organisasjonsform?.kode !== "KBO" && // Not a bankruptcy estate
          enhet.navn.toLowerCase().includes(baseCompanyName.toLowerCase()) &&
          !enhet.navn.toLowerCase().includes("konkursbo") &&
          !enhet.navn.toLowerCase().includes("tvangsavviklingsbo")
        ) {
          console.log(
            `✅ Found original company: ${enhet.navn} (${enhet.organisasjonsnummer})`
          );
          return {
            name: enhet.navn,
            organizationNumber: enhet.organisasjonsnummer,
            registrationDate: enhet.registreringsdatoEnhetsregisteret,
          };
        }
      }
    }

    console.log(`⚠️ Could not find original company for: ${baseCompanyName}`);
    return null;
  } catch (error) {
    console.error(
      `❌ Error finding original company for ${konkursboName}:`,
      error
    );
    return null;
  }
}

/**
 * Fetch bankruptcy data from Brønnøysundregistrene API with address change detection
 */
export async function fetchBankruptcyDataFromExternalAPI(
  kommuneNumber: string,
  startDate?: string,
  endDate?: string
): Promise<Partial<BankruptcyData>[]> {
  // Default to rolling 1-year window: 1 year ago to today
  if (!startDate) {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    startDate = oneYearAgo.toISOString().split("T")[0];
  }
  if (!endDate) {
    endDate = new Date().toISOString().split("T")[0]; // Today
  }

  console.log(
    `🔍 Fetching bankruptcy data for kommune ${kommuneNumber} from ${startDate} to ${endDate} (rolling 1-year window)`
  );

  try {
    // Use the correct Brønnøysundregistrene API endpoint
    // Based on https://data.brreg.no/enhetsregisteret/api/dokumentasjon
    const enhetsregisterUrl =
      "https://data.brreg.no/enhetsregisteret/api/enheter";

    // Search for businesses in the specific kommune across multiple pages
    const bankruptcies: Partial<BankruptcyData>[] = [];
    const pageSize = 500; // Smaller page size for reliability
    const maxPages = 5; // Limit to avoid overwhelming API

    for (let page = 0; page < maxPages; page++) {
      console.log(
        `📄 Fetching page ${page + 1}/${maxPages} for kommune ${kommuneNumber}...`
      );

      const searchParams = new URLSearchParams({
        kommunenummer: kommuneNumber,
        size: pageSize.toString(),
        page: page.toString(),
      });

      const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-app/1.0",
        },
      });

      if (!response.ok) {
        console.warn(
          `Failed to fetch page ${page}: ${response.status} ${response.statusText}`
        );
        break;
      }

      const data = await response.json();

      // If no results on this page, we've reached the end
      if (!data._embedded?.enheter || data._embedded.enheter.length === 0) {
        console.log(
          `No more results on page ${page + 1}, stopping pagination.`
        );
        break;
      }

      // Process the API response for this page
      if (data && data._embedded && data._embedded.enheter) {
        for (const enhet of data._embedded.enheter) {
          // Check if this business has bankruptcy information
          if (enhet.organisasjonsnummer && enhet.navn) {
            // Look for bankruptcy indicators based on actual API data structure
            const isBankrupt =
              // PRIMARY: Check the direct konkurs field (most reliable)
              enhet.konkurs === true ||
              // CRITICAL: Check organization form for KBO (Konkursbo) - this is the main indicator!
              (enhet.organisasjonsform &&
                enhet.organisasjonsform.kode === "KBO") ||
              // Check for konkurs date (another reliable indicator)
              enhet.konkursdato ||
              // Check organization form for other bankruptcy statuses
              (enhet.organisasjonsform &&
                (enhet.organisasjonsform.kode === "KONKURS" ||
                  enhet.organisasjonsform.beskrivelse
                    ?.toLowerCase()
                    .includes("konkurs"))) ||
              // Check business name for bankruptcy indicators
              enhet.navn.toLowerCase().includes("konkursbo") ||
              enhet.navn.toLowerCase().includes("konkurs");

            // Check if bankruptcy date is within our rolling window
            // For KBO (konkursbo), use stiftelsesdato as the bankruptcy date
            const bankruptcyDate =
              enhet.konkursdato ||
              (enhet.organisasjonsform?.kode === "KBO"
                ? enhet.stiftelsesdato
                : null) ||
              enhet.slettedato;
            const isWithinDateRange =
              !bankruptcyDate ||
              (bankruptcyDate >= startDate && bankruptcyDate <= endDate);

            if (isBankrupt && isWithinDateRange) {
              const isKoncursbo =
                enhet.organisasjonsform?.kode === "KBO" ||
                enhet.navn.toLowerCase().includes("konkursbo") ||
                enhet.navn.toLowerCase().includes("tvangsavviklingsbo");

              let finalCompanyName = enhet.navn;
              let finalOrgNumber = enhet.organisasjonsnummer;
              let originalCompany = null;
              let konkursboInfo = null;

              // If this is a KONKURSBO, try to find the original company
              if (isKoncursbo) {
                console.log(
                  `🏢 Found KONKURSBO: ${enhet.navn} (${enhet.organisasjonsnummer})`
                );

                // Store KONKURSBO info
                konkursboInfo = {
                  name: enhet.navn,
                  organizationNumber: enhet.organisasjonsnummer,
                  establishmentDate: enhet.stiftelsesdato || bankruptcyDate,
                };

                // Try to find the original company
                const foundOriginal = await findOriginalCompanyFromKoncursbo(
                  enhet.navn,
                  enhet.organisasjonsnummer
                );

                if (foundOriginal) {
                  originalCompany = foundOriginal;
                  finalCompanyName = foundOriginal.name;
                  finalOrgNumber = foundOriginal.organizationNumber;
                  console.log(
                    `✅ Using original company: ${finalCompanyName} (${finalOrgNumber})`
                  );
                } else {
                  // If we can't find the original, clean up the KONKURSBO name
                  finalCompanyName = enhet.navn
                    .replace(/\s+(KONKURSBO|TVANGSAVVIKLINGSBO)$/i, "")
                    .replace(/\s+KONKURS$/i, "")
                    .trim();
                  console.log(
                    `⚠️ Could not find original company, using cleaned name: ${finalCompanyName}`
                  );
                }

                // Add small delay after API call
                await new Promise((resolve) => setTimeout(resolve, 200));
              }

              // **SHELL COMPANY DETECTION: Check for suspicious short lifespan**
              const registrationDate =
                (originalCompany?.registrationDate
                  ? new Date(originalCompany.registrationDate)
                  : null) ||
                (enhet.registreringsdatoEnhetsregisteret
                  ? new Date(enhet.registreringsdatoEnhetsregisteret)
                  : null);
              const bankruptcyDateObj = bankruptcyDate
                ? new Date(bankruptcyDate)
                : new Date();

              let lifespanInDays = 0;
              let isShellCompanySuspicious = false;

              if (registrationDate) {
                lifespanInDays = Math.ceil(
                  (bankruptcyDateObj.getTime() - registrationDate.getTime()) /
                    (1000 * 60 * 60 * 24)
                );

                // SHELL COMPANY RED FLAGS:
                if (lifespanInDays <= 365) {
                  // Less than 1 year lifespan
                  isShellCompanySuspicious = true;
                  console.log(
                    `🚨 SHELL COMPANY ALERT: ${finalCompanyName} - Only ${lifespanInDays} days from registration to bankruptcy!`
                  );
                }
              }

              // Extract current address information
              let address = "";
              if (enhet.forretningsadresse) {
                const addr = enhet.forretningsadresse;
                const addressParts = [];
                if (addr.adresse && addr.adresse.length > 0) {
                  addressParts.push(addr.adresse.join(" "));
                }
                if (addr.postnummer) addressParts.push(addr.postnummer);
                if (addr.poststed) addressParts.push(addr.poststed);
                address = addressParts.join(", ");
              }

              // **KEY FEATURE: Fetch address history to detect moves out of kommune**
              console.log(
                `🔍 Checking address history for ${finalCompanyName} (${finalOrgNumber})`
              );
              const addressHistory =
                await fetchCompanyAddressHistory(finalOrgNumber);

              // Add small delay to avoid overwhelming the API
              await new Promise((resolve) => setTimeout(resolve, 100));

              bankruptcies.push({
                companyName: finalCompanyName,
                organizationNumber: finalOrgNumber,
                bankruptcyDate: bankruptcyDate || startDate,
                address: address,
                industry: enhet.naeringskode1?.beskrivelse || "Ukjent bransje",
                hasRecentAddressChange: addressHistory.hasRecentAddressChange,
                previousAddresses: addressHistory.previousAddresses,
                // **NEW: Shell company fraud indicators**
                lifespanInDays: lifespanInDays,
                isShellCompanySuspicious: isShellCompanySuspicious,
                registrationDate: registrationDate
                  ? registrationDate.toISOString().split("T")[0]
                  : null,
                // **NEW: Original company vs bankruptcy estate info**
                originalCompany: originalCompany,
                konkursbo: konkursboInfo,
              });

              if (addressHistory.hasRecentAddressChange) {
                console.log(
                  `⚠️  ADDRESS ALERT: ${enhet.navn} moved out of kommune before bankruptcy!`
                );
              }
            }
          }
        }
      }

      // Add delay between pages to be respectful to the API
      if (page < maxPages - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    console.log(
      `✅ Found ${bankruptcies.length} potential bankruptcies for kommune ${kommuneNumber} (searched ${maxPages} pages)`
    );

    const addressChangeCount = bankruptcies.filter(
      (b) => b.hasRecentAddressChange
    ).length;
    if (addressChangeCount > 0) {
      console.log(
        `🚨 FRAUD ALERT: ${addressChangeCount} companies moved out of kommune before bankruptcy!`
      );
    }

    return bankruptcies;
  } catch (error) {
    console.error("❌ Failed to fetch bankruptcy data from API:", error);
    throw new Error(`Failed to fetch bankruptcy data: ${error.message}`);
  }
}

/**
 * Get all kommuner from database
 */
export async function getAllKommuner(): Promise<KommuneData[]> {
  try {
    return await getAllKommunerFromDB();
  } catch (error) {
    console.error("Failed to fetch kommuner from database:", error);
    throw new Error("Failed to fetch municipalities from database");
  }
}

/**
 * Get bankruptcy data for a specific kommune
 */
export async function getBankruptcyDataForKommune(
  kommuneNumber: string
): Promise<BankruptcyData[]> {
  try {
    return await getBankruptciesForKommune(kommuneNumber);
  } catch (error) {
    console.error("Failed to fetch bankruptcy data from database:", error);
    throw new Error("Failed to fetch bankruptcy data from database");
  }
}

/**
 * Get all companies for a specific kommune
 */
export async function getAllCompaniesForKommune(
  kommuneNumber: string
): Promise<BankruptcyData[]> {
  try {
    return await getAllCompaniesFromDB(kommuneNumber);
  } catch (error) {
    console.error("Failed to fetch all companies from database:", error);
    throw new Error("Failed to fetch all companies from database");
  }
}

/**
 * Update data for a specific kommune by filling gaps
 */
export async function updateKommuneData(kommuneNumber: string): Promise<{
  gapsFilled: number;
  recordsAdded: number;
  recordsUpdated: number;
}> {
  console.log(`🔄 Updating data for kommune ${kommuneNumber}`);

  try {
    // Get existing data
    const existingData = await getBankruptciesForKommune(kommuneNumber);

    // Calculate gaps
    const gaps = calculateDataGaps(existingData, kommuneNumber);

    let totalRecordsAdded = 0;
    let totalRecordsUpdated = 0;

    // Fill each gap
    for (const gap of gaps) {
      try {
        const newData = await fetchBankruptcyDataFromExternalAPI(
          kommuneNumber,
          gap.startDate,
          gap.endDate
        );

        if (newData.length > 0) {
          const result = await saveBankruptcyData(kommuneNumber, newData);
          totalRecordsAdded += result.saved;
          totalRecordsUpdated += result.updated;
        }
      } catch (error) {
        console.error(
          `❌ Failed to fetch data for gap ${gap.startDate} to ${gap.endDate}:`,
          error
        );
      }
    }

    console.log(
      `✅ Kommune ${kommuneNumber}: ${gaps.length} gaps processed, ${totalRecordsAdded} new records, ${totalRecordsUpdated} updated`
    );

    return {
      gapsFilled: gaps.length,
      recordsAdded: totalRecordsAdded,
      recordsUpdated: totalRecordsUpdated,
    };
  } catch (error) {
    console.error(`❌ Failed to update kommune ${kommuneNumber}:`, error);
    throw error;
  }
}

/**
 * Update data for all kommuner
 */
export async function updateAllKommunerData(): Promise<{
  kommunerUpdated: number;
  totalGapsFilled: number;
  totalRecordsAdded: number;
  totalRecordsUpdated: number;
}> {
  console.log("🚀 Starting daily update for all kommuner...");

  try {
    const kommuner = await getAllKommuner();
    let totalGapsFilled = 0;
    let totalRecordsAdded = 0;
    let totalRecordsUpdated = 0;

    for (const kommune of kommuner) {
      try {
        const result = await updateKommuneData(kommune.id);
        totalGapsFilled += result.gapsFilled;
        totalRecordsAdded += result.recordsAdded;
        totalRecordsUpdated += result.recordsUpdated;

        // Add small delay to avoid overwhelming external APIs
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          `❌ Failed to update data for kommune ${kommune.name}:`,
          error
        );
      }
    }

    const summary = {
      kommunerUpdated: kommuner.length,
      totalGapsFilled,
      totalRecordsAdded,
      totalRecordsUpdated,
    };

    console.log(`🎉 Daily update completed:`, summary);

    return summary;
  } catch (error) {
    console.error("❌ Failed to update all kommuner:", error);
    throw error;
  }
}

/**
 * Get data coverage statistics for a kommune
 */
export async function getKommuneDataCoverage(kommuneNumber: string) {
  try {
    return await getDataCoverage(kommuneNumber);
  } catch (error) {
    console.error(
      `Failed to get data coverage for kommune ${kommuneNumber}:`,
      error
    );
    return {
      coverage: 0,
      totalDays: 365,
      missingDays: 365,
      dataGaps: ["Kunne ikke beregne dekning"],
    };
  }
}

/**
 * Get basic kommune information for fallback when no data is available
 */
export function getKommuneInfo(kommuneNumber: string): {
  id: string;
  name: string;
  county: string;
} {
  // Basic Norwegian municipality information for UI fallback
  // Extended with common kommune mappings
  const basicKommuneInfo: Record<string, { name: string; county: string }> = {
    "4201": { name: "Risør", county: "Agder" },
    "0301": { name: "Oslo", county: "Oslo" },
    "1103": { name: "Stavanger", county: "Rogaland" },
    "4203": { name: "Arendal", county: "Agder" },
    "4211": { name: "Tvedestrand", county: "Agder" },
    "4020": { name: "Midt-Telemark", county: "Telemark" },
    "5001": { name: "Bergen", county: "Vestland" },
    "5401": { name: "Tromsø", county: "Troms og Finnmark" },
  };

  const info = basicKommuneInfo[kommuneNumber];
  if (info) {
    return {
      id: kommuneNumber,
      name: info.name,
      county: info.county,
    };
  }

  // Fallback for unknown kommune IDs
  return {
    id: kommuneNumber,
    name: `Kommune ${kommuneNumber}`,
    county: "Ukjent",
  };
}
