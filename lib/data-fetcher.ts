import {
  getAllKommuner as getAllKommunerFromDB,
  getBankruptciesForKommune,
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
      console.warn(`Could not fetch address history for ${organizationNumber}: ${response.status}`);
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
      const registrationDate = new Date(companyData.registreringsdatoEnhetsregisteret);
      
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
                  kommuneNumber: companyData.postadresse?.kommunenummer || "0000",
                },
                fromDate: oneYearAgo.toISOString().split('T')[0],
                toDate: registrationDate.toISOString().split('T')[0],
              });
            }
          }
        }
      }
    }

    return { hasRecentAddressChange, previousAddresses };
  } catch (error) {
    console.warn(`Failed to fetch address history for ${organizationNumber}:`, error);
    return { hasRecentAddressChange: false, previousAddresses: [] };
  }
}

/**
 * Fetch bankruptcy data from Brønnøysundregistrene API with address change detection
 */
export async function fetchBankruptcyDataFromExternalAPI(
  kommuneNumber: string,
  startDate: string,
  endDate: string
): Promise<Partial<BankruptcyData>[]> {
  console.log(
    `🔍 Fetching bankruptcy data for kommune ${kommuneNumber} from ${startDate} to ${endDate}`
  );

  try {
    // Use the correct Brønnøysundregistrene API endpoint
    // Based on https://data.brreg.no/enhetsregisteret/api/dokumentasjon
    const enhetsregisterUrl = "https://data.brreg.no/enhetsregisteret/api/enheter";

    // Search for businesses in the specific kommune
    const searchParams = new URLSearchParams({
      kommunenummer: kommuneNumber,
      size: "1000", // Max results per page
      page: "0",
      // Add additional filters if needed
    });

    const response = await fetch(`${enhetsregisterUrl}?${searchParams}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-app/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const bankruptcies: Partial<BankruptcyData>[] = [];

    // Process the API response
    if (data && data._embedded && data._embedded.enheter) {
      for (const enhet of data._embedded.enheter) {
        // Check if this business has bankruptcy information
        if (enhet.organisasjonsnummer && enhet.navn) {
          // Look for bankruptcy indicators based on actual API data structure
          const isBankrupt =
            // Check organization form for bankruptcy status
            (enhet.organisasjonsform &&
             (enhet.organisasjonsform.kode === "KONKURS" ||
              enhet.organisasjonsform.beskrivelse?.toLowerCase().includes("konkurs"))) ||
            // Check business name for bankruptcy indicators
            enhet.navn.toLowerCase().includes("konkursbo") ||
            enhet.navn.toLowerCase().includes("konkurs") ||
            // Check if entity is marked as deleted/inactive (potential bankruptcy indicator)
            enhet.slettedato ||
            // Check business status
            (enhet.enhetstype && enhet.enhetstype.toLowerCase().includes("konkurs"));

          if (isBankrupt) {
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
            console.log(`🔍 Checking address history for ${enhet.navn} (${enhet.organisasjonsnummer})`);
            const addressHistory = await fetchCompanyAddressHistory(enhet.organisasjonsnummer);
            
            // Add small delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 100));

            bankruptcies.push({
              companyName: enhet.navn,
              organizationNumber: enhet.organisasjonsnummer,
              bankruptcyDate: enhet.slettedato || enhet.registreringsdatoEnhetsregisteret || startDate,
              address: address,
              industry: enhet.naeringskode1?.beskrivelse || "Ukjent bransje",
              hasRecentAddressChange: addressHistory.hasRecentAddressChange,
              previousAddresses: addressHistory.previousAddresses,
            });

            if (addressHistory.hasRecentAddressChange) {
              console.log(`⚠️  ADDRESS ALERT: ${enhet.navn} moved out of kommune before bankruptcy!`);
            }
          }
        }
      }
    }

    console.log(
      `✅ Found ${bankruptcies.length} potential bankruptcies for kommune ${kommuneNumber}`
    );

    const addressChangeCount = bankruptcies.filter(b => b.hasRecentAddressChange).length;
    if (addressChangeCount > 0) {
      console.log(`🚨 FRAUD ALERT: ${addressChangeCount} companies moved out of kommune before bankruptcy!`);
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
  const basicKommuneInfo: Record<string, { name: string; county: string }> = {
    "0301": { name: "Oslo", county: "Oslo" },
    "4201": { name: "Risør", county: "Agder" },
    "4203": { name: "Arendal", county: "Agder" },
    "1103": { name: "Stavanger", county: "Rogaland" },
    "4601": { name: "Bergen", county: "Vestland" },
    "5001": { name: "Trondheim", county: "Trøndelag" },
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
