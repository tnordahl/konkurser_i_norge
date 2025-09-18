/**
 * Pattern-Based Fraud Detection System
 *
 * This system discovers fraud patterns WITHOUT hardcoding company names.
 * It uses algorithms to detect suspicious patterns:
 *
 * 1. Professional Service Network Analysis
 * 2. Address Pattern Matching
 * 3. Industry Risk Profiling
 * 4. Registration Timing Analysis
 * 5. Geographic Movement Patterns
 */

export interface DetectedFraudPattern {
  companyName: string;
  organizationNumber: string;
  detectionReason: string[];
  riskScore: number; // 0-100
  patternMatches: string[];
  confidence: number; // 0-100
  currentLocation: {
    kommuneNumber: string;
    kommuneName: string;
  };
  suspectedOrigin: {
    kommuneNumber: string;
    kommuneName: string;
    evidence: string[];
  };
}

/**
 * Main pattern detection algorithm - NO hardcoded company names
 */
export async function detectFraudPatterns(
  targetKommuneNumber: string
): Promise<DetectedFraudPattern[]> {
  console.log(
    `🔍 PATTERN-BASED DETECTION: Analyzing fraud patterns for kommune ${targetKommuneNumber}`
  );

  const detectedPatterns: DetectedFraudPattern[] = [];

  // Pattern 1: Professional Service Network Reverse Lookup
  const servicePatterns =
    await detectViaServiceNetworkPatterns(targetKommuneNumber);
  detectedPatterns.push(...servicePatterns);

  // Pattern 2: Address String Analysis
  const addressPatterns =
    await detectViaAddressStringPatterns(targetKommuneNumber);
  detectedPatterns.push(...addressPatterns);

  // Pattern 3: Industry + Location Risk Analysis
  const industryPatterns =
    await detectViaIndustryLocationPatterns(targetKommuneNumber);
  detectedPatterns.push(...industryPatterns);

  // Pattern 4: Registration Timing Patterns
  const timingPatterns = await detectViaTimingPatterns(targetKommuneNumber);
  detectedPatterns.push(...timingPatterns);

  // Remove duplicates and sort by risk score
  const uniquePatterns = deduplicateByCompany(detectedPatterns);
  const sortedPatterns = uniquePatterns
    .filter((p) => p.riskScore >= 60) // Only high-risk patterns
    .sort((a, b) => b.riskScore - a.riskScore);

  console.log(
    `✅ Pattern detection complete: ${sortedPatterns.length} suspicious patterns found`
  );
  return sortedPatterns;
}

/**
 * Pattern 1: Find companies via professional service networks
 * Logic: Search for companies that use accountants/lawyers in target kommune but are registered elsewhere
 */
async function detectViaServiceNetworkPatterns(
  kommuneNumber: string
): Promise<DetectedFraudPattern[]> {
  const patterns: DetectedFraudPattern[] = [];

  if (kommuneNumber !== "4201") return patterns; // Only Risør for now

  try {
    // In a real system, this would:
    // 1. Find all accountants/lawyers in Risør
    // 2. Search their client lists
    // 3. Flag clients registered outside Risør

    // For now, we'll simulate by searching for companies with Risør postal codes but registered elsewhere
    const response = await fetch(
      "https://data.brreg.no/enhetsregisteret/api/enheter?poststed=RISØR&size=100"
    );

    if (response.ok) {
      const data = await response.json();

      if (data._embedded?.enheter) {
        for (const enhet of data._embedded.enheter) {
          // Check if business address is DIFFERENT from postal address
          const businessKommune = enhet.forretningsadresse?.kommunenummer;
          const postKommune = enhet.postadresse?.kommunenummer;
          const hasRisorConnection =
            enhet.forretningsadresse?.poststed
              ?.toLowerCase()
              .includes("risør") ||
            enhet.postadresse?.poststed?.toLowerCase().includes("risør") ||
            postKommune === "4201";

          if (hasRisorConnection && businessKommune !== "4201") {
            const riskScore = calculateServiceNetworkRisk(enhet);

            if (riskScore >= 60) {
              patterns.push({
                companyName: enhet.navn,
                organizationNumber: enhet.organisasjonsnummer,
                detectionReason: ["PROFESSIONAL_SERVICE_NETWORK_PATTERN"],
                riskScore,
                patternMatches: [
                  "Has Risør postal/service connection but registered elsewhere",
                  businessKommune
                    ? `Registered in kommune ${businessKommune}`
                    : "Unknown registration location",
                ],
                confidence: 75,
                currentLocation: {
                  kommuneNumber: businessKommune || "UNKNOWN",
                  kommuneName: enhet.forretningsadresse?.poststed || "UNKNOWN",
                },
                suspectedOrigin: {
                  kommuneNumber: "4201",
                  kommuneName: "RISØR",
                  evidence: ["Postal address or service connection in Risør"],
                },
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn("Service network pattern detection failed:", error);
  }

  return patterns;
}

/**
 * Pattern 2: Address string analysis
 * Logic: Look for companies with address strings that suggest Risør connection
 */
async function detectViaAddressStringPatterns(
  kommuneNumber: string
): Promise<DetectedFraudPattern[]> {
  const patterns: DetectedFraudPattern[] = [];

  if (kommuneNumber !== "4201") return patterns;

  try {
    // Multi-approach pattern detection
    const approaches = [
      // Approach 1: Search for companies with Risør addresses but registered elsewhere
      { type: "postal", query: "poststed=RISØR" },
      // Approach 2: Search for high-risk business types
      { type: "industry", query: "naeringskode=56.101" }, // Restaurants
      { type: "industry", query: "naeringskode=55.100" }, // Hotels
    ];

    for (const approach of approaches) {
      const response = await fetch(
        `https://data.brreg.no/enhetsregisteret/api/enheter?${approach.query}&size=100`
      );

      if (response.ok) {
        const data = await response.json();

        if (data._embedded?.enheter) {
          for (const enhet of data._embedded.enheter) {
            const businessKommune = enhet.forretningsadresse?.kommunenummer;
            const postKommune = enhet.postadresse?.kommunenummer;

            // Filter out property management companies (sameier, borettslag, etc.)
            const isPropertyManagement =
              enhet.navn?.toLowerCase().includes("sameie") ||
              enhet.navn?.toLowerCase().includes("borettslag") ||
              enhet.navn?.toLowerCase().includes("sameiget") ||
              enhet.organisasjonsform?.kode === "ESAM" || // Eierseksjonssameie
              enhet.organisasjonsform?.kode === "ESEK"; // Eierseksjonsselskap

            // Detect suspicious patterns
            let isSuspicious = false;
            let suspiciousReasons: string[] = [];

            if (approach.type === "postal") {
              // Has Risør postal address but registered elsewhere
              if (
                (postKommune === "4201" ||
                  enhet.postadresse?.poststed
                    ?.toLowerCase()
                    .includes("risør")) &&
                businessKommune !== "4201"
              ) {
                isSuspicious = true;
                suspiciousReasons.push(
                  "Has Risør postal address but registered elsewhere"
                );
              }
            } else if (approach.type === "industry") {
              // High-risk industry with ACTUAL Risør connection (not just any mismatch)
              const hasActualRisorConnection =
                postKommune === "4201" ||
                businessKommune === "4201" ||
                enhet.postadresse?.poststed?.toLowerCase().includes("risør") ||
                enhet.forretningsadresse?.poststed
                  ?.toLowerCase()
                  .includes("risør") ||
                enhet.navn?.toLowerCase().includes("risør");

              if (hasActualRisorConnection && businessKommune !== "4201") {
                isSuspicious = true;
                suspiciousReasons.push(
                  "High-risk industry with confirmed Risør connection but registered elsewhere"
                );
              }
            }

            if (isSuspicious && !isPropertyManagement) {
              const riskScore = calculateMultiApproachRisk(
                enhet,
                approach,
                suspiciousReasons
              );

              if (riskScore >= 70) {
                // Increased threshold to reduce false positives
                patterns.push({
                  companyName: enhet.navn,
                  organizationNumber: enhet.organisasjonsnummer,
                  detectionReason: ["ADDRESS_STRING_PATTERN"],
                  riskScore,
                  patternMatches: suspiciousReasons,
                  confidence: 65,
                  currentLocation: {
                    kommuneNumber: businessKommune || "UNKNOWN",
                    kommuneName:
                      enhet.forretningsadresse?.poststed || "UNKNOWN",
                  },
                  suspectedOrigin: {
                    kommuneNumber: "4201",
                    kommuneName: "RISØR",
                    evidence: [`Detected via ${approach.type} analysis`],
                  },
                });
              }
            }
          }
        }
      }

      // Rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  } catch (error) {
    console.warn("Address pattern detection failed:", error);
  }

  return patterns;
}

/**
 * Pattern 3: Industry + Location risk analysis
 * Logic: High-risk industries (restaurants, construction) that moved from small to large komuner
 */
async function detectViaIndustryLocationPatterns(
  kommuneNumber: string
): Promise<DetectedFraudPattern[]> {
  const patterns: DetectedFraudPattern[] = [];

  // High-risk industries for fraud
  const highRiskIndustries = [
    "56.101", // Restaurants
    "43.110", // Building demolition
    "43.120", // Site preparation
    "55.100", // Hotels
    "96.020", // Hairdressing
  ];

  // This would be implemented with more sophisticated industry analysis
  // For now, we return empty to focus on other patterns

  return patterns;
}

/**
 * Pattern 4: Registration timing analysis
 * Logic: Companies registered recently in nearby kommuner during economic stress periods
 */
async function detectViaTimingPatterns(
  kommuneNumber: string
): Promise<DetectedFraudPattern[]> {
  const patterns: DetectedFraudPattern[] = [];

  // This would analyze registration dates vs economic events
  // For now, we return empty to focus on other patterns

  return patterns;
}

/**
 * Calculate risk score for service network patterns
 */
function calculateServiceNetworkRisk(enhet: any): number {
  let risk = 0;

  // Base risk for cross-kommune service pattern
  risk += 40;

  // Industry risk multiplier
  const industryCode = enhet.naeringskode1?.kode;
  if (["56.101", "55.100", "43.110"].includes(industryCode)) {
    risk += 25; // High-risk industries
  }

  // Registration timing
  if (enhet.registreringsdatoEnhetsregisteret) {
    const regDate = new Date(enhet.registreringsdatoEnhetsregisteret);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (regDate > oneYearAgo) {
      risk += 20; // Recent registration
    }
  }

  // Address mismatch
  const businessKommune = enhet.forretningsadresse?.kommunenummer;
  const postKommune = enhet.postadresse?.kommunenummer;
  if (businessKommune !== postKommune) {
    risk += 15;
  }

  return Math.min(risk, 100);
}

/**
 * Calculate risk score for multi-approach detection
 */
function calculateMultiApproachRisk(
  enhet: any,
  approach: any,
  reasons: string[]
): number {
  let risk = 0;

  // Base risk for pattern match
  risk += 40;

  // Approach-specific risk
  if (approach.type === "postal") {
    risk += 30; // Strong indicator of address mismatch
  } else if (approach.type === "industry") {
    risk += 25; // Industry-based risk
  }

  // Industry multiplier
  const industryCode = enhet.naeringskode1?.kode;
  if (["56.101", "55.100", "43.110"].includes(industryCode)) {
    risk += 20; // High-risk industries
  }

  // Registration timing
  if (enhet.registreringsdatoEnhetsregisteret) {
    const regDate = new Date(enhet.registreringsdatoEnhetsregisteret);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (regDate > oneYearAgo) {
      risk += 15; // Recent registration
    }
  }

  // Multiple suspicious reasons
  risk += reasons.length * 5;

  return Math.min(risk, 100);
}

/**
 * Calculate risk score for address pattern matches
 */
function calculateAddressPatternRisk(
  enhet: any,
  streetPattern: string
): number {
  let risk = 0;

  // Base risk for address pattern
  risk += 35;

  // Specific street patterns
  if (streetPattern === "Strandgata") {
    risk += 30; // Very specific to Risør
  }

  // Industry multiplier
  const industryCode = enhet.naeringskode1?.kode;
  if (["56.101", "55.100"].includes(industryCode)) {
    risk += 20; // Restaurants/hotels
  }

  // Company name analysis
  if (enhet.navn?.toLowerCase().includes("restaurant")) {
    risk += 15;
  }

  return Math.min(risk, 100);
}

/**
 * Remove duplicate companies from detection results
 */
function deduplicateByCompany(
  patterns: DetectedFraudPattern[]
): DetectedFraudPattern[] {
  const seen = new Map<string, DetectedFraudPattern>();

  for (const pattern of patterns) {
    const key = pattern.organizationNumber || pattern.companyName;

    if (!seen.has(key) || seen.get(key)!.riskScore < pattern.riskScore) {
      seen.set(key, pattern);
    }
  }

  return Array.from(seen.values());
}
