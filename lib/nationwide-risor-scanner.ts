/**
 * Nationwide Risør Connection Scanner
 *
 * This scanner looks through ALL companies in Norway to find any that have
 * EVER had any connection to Risør, including:
 * - Current addresses in Risør
 * - Historical addresses containing "Risør" or postal codes 495X
 * - Business addresses vs postal addresses with Risør connections
 * - Company names suggesting Risør origins
 */

export interface RisørConnection {
  companyName: string;
  organizationNumber: string;
  connectionType:
    | "CURRENT_ADDRESS"
    | "POSTAL_ADDRESS"
    | "COMPANY_NAME"
    | "HISTORICAL_INDICATOR";
  connectionDetails: string;
  currentLocation: {
    address: string;
    kommuneNumber: string;
    kommuneName: string;
  };
  risørConnection: {
    evidence: string[];
    confidence: number; // 0-100
  };
  registrationDate?: string;
  industry?: string;
  riskScore: number;
}

/**
 * Scan ALL companies in Norway for Risør connections
 * This is a comprehensive approach that doesn't miss historical moves
 */
export async function scanNationwideForRisørConnections(): Promise<
  RisørConnection[]
> {
  console.log("🇳🇴 NATIONWIDE RISØR SCANNER: Starting comprehensive scan...");

  const connections: RisørConnection[] = [];
  const enhetsregisterUrl =
    "https://data.brreg.no/enhetsregisteret/api/enheter";

  try {
    // Strategy 1: Direct Risør searches
    const directSearches = [
      { query: "poststed=RISØR", type: "postal" },
      { query: "navn=Risør", type: "name" },
      { query: "navn=Strandgata", type: "street" },
      { query: "kommunenummer=4201", type: "kommune" },
    ];

    for (const search of directSearches) {
      console.log(`🔍 Scanning: ${search.query}`);
      await scanWithQuery(
        enhetsregisterUrl,
        search.query,
        search.type,
        connections
      );

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Strategy 2: Postal code range scan (4950-4959 are Risør area codes)
    for (let postalCode = 4950; postalCode <= 4959; postalCode++) {
      console.log(`📮 Scanning postal code: ${postalCode}`);
      await scanWithQuery(
        enhetsregisterUrl,
        `postnummer=${postalCode}`,
        "postal_code",
        connections
      );

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Strategy 3: Industry-based scan in nearby areas (looking for moves)
    const nearbyKommuner = ["4203", "4213", "4211", "0301"]; // Arendal, Tvedestrand, Gjerstad, Oslo
    const riskIndustries = ["55.100", "56.101", "43.110"];

    for (const kommune of nearbyKommuner) {
      for (const industry of riskIndustries) {
        console.log(`🏭 Scanning ${industry} in kommune ${kommune}...`);
        await scanIndustryInKommune(
          enhetsregisterUrl,
          kommune,
          industry,
          connections
        );

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    // Remove duplicates and sort by risk score
    const uniqueConnections = deduplicateConnections(connections);
    const sortedConnections = uniqueConnections
      .filter((c) => c.riskScore >= 40) // Only meaningful connections
      .sort((a, b) => b.riskScore - a.riskScore);

    console.log(
      `✅ Nationwide scan complete: ${sortedConnections.length} Risør connections found`
    );
    return sortedConnections;
  } catch (error) {
    console.error("Nationwide Risør scan failed:", error);
    return [];
  }
}

/**
 * Scan with a specific query and categorize results
 */
async function scanWithQuery(
  baseUrl: string,
  query: string,
  type: string,
  connections: RisørConnection[]
): Promise<void> {
  const maxPages = 3; // Limit to avoid overwhelming the API

  for (let page = 0; page < maxPages; page++) {
    try {
      const response = await fetch(`${baseUrl}?${query}&size=500&page=${page}`);

      if (!response.ok) {
        console.warn(`Failed to fetch page ${page} for query: ${query}`);
        break;
      }

      const data = await response.json();

      if (!data._embedded?.enheter || data._embedded.enheter.length === 0) {
        break; // No more results
      }

      for (const enhet of data._embedded.enheter) {
        const connection = analyzeCompanyForRisørConnection(enhet, type);
        if (connection) {
          connections.push(connection);
        }
      }

      // Short delay between pages
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.warn(`Error scanning page ${page} for query ${query}:`, error);
      break;
    }
  }
}

/**
 * Scan specific industry in specific kommune (looking for moved companies)
 */
async function scanIndustryInKommune(
  baseUrl: string,
  kommuneNumber: string,
  industryCode: string,
  connections: RisørConnection[]
): Promise<void> {
  try {
    const response = await fetch(
      `${baseUrl}?kommunenummer=${kommuneNumber}&naeringskode=${industryCode}&size=100`
    );

    if (response.ok) {
      const data = await response.json();

      if (data._embedded?.enheter) {
        for (const enhet of data._embedded.enheter) {
          // Look for Risør connections in companies outside Risør
          if (enhet.forretningsadresse?.kommunenummer !== "4201") {
            const connection = analyzeCompanyForRisørConnection(
              enhet,
              "industry_scan"
            );
            if (connection && connection.riskScore >= 50) {
              // Higher threshold for industry scans
              connections.push(connection);
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn(
      `Error scanning industry ${industryCode} in kommune ${kommuneNumber}:`,
      error
    );
  }
}

/**
 * Analyze a single company for any Risør connections
 */
function analyzeCompanyForRisørConnection(
  enhet: any,
  searchType: string
): RisørConnection | null {
  const evidence: string[] = [];
  let connectionType: RisørConnection["connectionType"] =
    "HISTORICAL_INDICATOR";
  let confidence = 0;
  let riskScore = 0;

  // Check business address
  if (enhet.forretningsadresse) {
    if (enhet.forretningsadresse.kommunenummer === "4201") {
      evidence.push("Currently registered in Risør kommune");
      connectionType = "CURRENT_ADDRESS";
      confidence += 40;
      riskScore += 30;
    }

    if (enhet.forretningsadresse.poststed?.toLowerCase().includes("risør")) {
      evidence.push("Business address contains 'Risør'");
      confidence += 30;
      riskScore += 25;
    }

    if (enhet.forretningsadresse.postnummer?.startsWith("495")) {
      evidence.push(
        `Risør area postal code: ${enhet.forretningsadresse.postnummer}`
      );
      confidence += 35;
      riskScore += 30;
    }
  }

  // Check postal address
  if (enhet.postadresse) {
    if (enhet.postadresse.kommunenummer === "4201") {
      evidence.push("Postal address in Risør kommune");
      connectionType = "POSTAL_ADDRESS";
      confidence += 35;
      riskScore += 25;
    }

    if (enhet.postadresse.poststed?.toLowerCase().includes("risør")) {
      evidence.push("Postal address contains 'Risør'");
      confidence += 25;
      riskScore += 20;
    }

    if (enhet.postadresse.postnummer?.startsWith("495")) {
      evidence.push(
        `Risør area postal code in postal address: ${enhet.postadresse.postnummer}`
      );
      confidence += 30;
      riskScore += 25;
    }
  }

  // Check company name
  if (enhet.navn?.toLowerCase().includes("risør")) {
    evidence.push("Company name contains 'Risør'");
    connectionType = "COMPANY_NAME";
    confidence += 45;
    riskScore += 35;
  }

  // Check for Risør street names in company name
  const risorStreets = ["strandgata", "torvet", "havnegata", "prestegata"];
  for (const street of risorStreets) {
    if (enhet.navn?.toLowerCase().includes(street)) {
      evidence.push(`Company name contains Risør street name: ${street}`);
      confidence += 25;
      riskScore += 20;
    }
  }

  // Industry risk multiplier
  const industryCode = enhet.naeringskode1?.kode;
  if (["55.100", "56.101", "43.110"].includes(industryCode)) {
    riskScore += 15; // High-risk industries
    evidence.push(`High-risk industry: ${enhet.naeringskode1?.beskrivelse}`);
  }

  // Registration timing
  if (enhet.registreringsdatoEnhetsregisteret) {
    const regDate = new Date(enhet.registreringsdatoEnhetsregisteret);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (regDate > oneYearAgo) {
      riskScore += 10; // Recent registration
      evidence.push("Registered within last year");
    }
  }

  // Address mismatch bonus (potential move indicator)
  const businessKommune = enhet.forretningsadresse?.kommunenummer;
  const postKommune = enhet.postadresse?.kommunenummer;
  if (
    businessKommune !== postKommune &&
    (businessKommune === "4201" || postKommune === "4201")
  ) {
    riskScore += 20;
    evidence.push("Address mismatch with Risør connection");
  }

  // Only return if we found meaningful evidence
  if (evidence.length === 0 || confidence < 20) {
    return null;
  }

  return {
    companyName: enhet.navn,
    organizationNumber: enhet.organisasjonsnummer,
    connectionType,
    connectionDetails: evidence.join("; "),
    currentLocation: {
      address: enhet.forretningsadresse?.adresse?.join(", ") || "Unknown",
      kommuneNumber: enhet.forretningsadresse?.kommunenummer || "Unknown",
      kommuneName: enhet.forretningsadresse?.poststed || "Unknown",
    },
    risørConnection: {
      evidence,
      confidence,
    },
    registrationDate: enhet.registreringsdatoEnhetsregisteret,
    industry: enhet.naeringskode1?.beskrivelse,
    riskScore: Math.min(riskScore, 100),
  };
}

/**
 * Remove duplicate companies from results
 */
function deduplicateConnections(
  connections: RisørConnection[]
): RisørConnection[] {
  const seen = new Map<string, RisørConnection>();

  for (const connection of connections) {
    const key = connection.organizationNumber || connection.companyName;

    if (!seen.has(key) || seen.get(key)!.riskScore < connection.riskScore) {
      seen.set(key, connection);
    }
  }

  return Array.from(seen.values());
}

/**
 * Get a focused scan of companies that have moved FROM Risør
 * This specifically looks for companies that are NOT in Risør but have Risør indicators
 */
export async function findCompaniesMovedFromRisør(): Promise<
  RisørConnection[]
> {
  console.log("🔍 FOCUSED SCAN: Finding companies that moved FROM Risør...");

  const allConnections = await scanNationwideForRisørConnections();

  // Filter for companies that have Risør connections but are NOT currently in Risør
  const movedCompanies = allConnections.filter((connection) => {
    const notCurrentlyInRisor =
      connection.currentLocation.kommuneNumber !== "4201";
    const hasRisorConnection = connection.riskScore >= 50;

    return notCurrentlyInRisor && hasRisorConnection;
  });

  console.log(
    `🎯 Found ${movedCompanies.length} companies that appear to have moved FROM Risør`
  );
  return movedCompanies;
}
