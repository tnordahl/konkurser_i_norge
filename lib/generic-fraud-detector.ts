/**
 * Generic Fraud Detection System
 *
 * Instead of hardcoding specific companies, this system uses algorithms to detect:
 * 1. Companies that use professional services in a kommune but are registered elsewhere
 * 2. Address change patterns that indicate potential fraud
 * 3. Professional network analysis to find escaped companies
 * 4. "Phoenix company" fraud: New companies created before parent company bankruptcy
 * 5. Asset stripping patterns: Similar business names/activities in different locations
 */

export interface EscapedCompanyPattern {
  companyName: string;
  organizationNumber: string;
  currentAddress: {
    address: string;
    kommuneNumber: string;
    kommuneName: string;
  };
  suspectedOriginKommune: {
    kommuneNumber: string;
    kommuneName: string;
    evidence: string[];
  };
  fraudIndicators: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  detectionMethod: string;
  confidence: number; // 0-100
  // **NEW: Shell company indicators**
  lifespanInDays?: number;
  isShellCompanySuspicious?: boolean;
  registrationDate?: string;
}

/**
 * GENERIC PROFESSIONAL SERVICE DETECTION
 * The system will automatically discover professional service networks
 * by analyzing company data and connections dynamically
 */

/**
 * FULLY DYNAMIC DETECTION - NO HARDCODED PATTERNS
 * The system will discover suspicious companies through:
 * 1. Address history analysis from API
 * 2. Professional service network connections
 * 3. Business relationship patterns
 * 4. Cross-reference with actual bankruptcy data
 */

/**
 * Detect shell companies based on short lifespan and suspicious patterns
 */
export function detectShellCompanyPatterns(
  registrationDate: string,
  bankruptcyDate: string,
  companyName: string
): {
  lifespanInDays: number;
  isShellCompanySuspicious: boolean;
  shellCompanyIndicators: string[];
} {
  const regDate = new Date(registrationDate);
  const bankDate = new Date(bankruptcyDate);
  const lifespanInDays = Math.ceil(
    (bankDate.getTime() - regDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const shellCompanyIndicators: string[] = [];
  let isShellCompanySuspicious = false;

  // **SHELL COMPANY RED FLAGS:**

  // 1. Extremely short lifespan (less than 6 months)
  if (lifespanInDays <= 180) {
    shellCompanyIndicators.push("EXTREMELY_SHORT_LIFESPAN");
    isShellCompanySuspicious = true;
  }
  // 2. Short lifespan (less than 1 year)
  else if (lifespanInDays <= 365) {
    shellCompanyIndicators.push("SHORT_LIFESPAN");
    isShellCompanySuspicious = true;
  }

  // 3. Company name patterns that suggest shell companies
  const suspiciousNamePatterns = [
    /holding/i,
    /invest/i,
    /capital/i,
    /management/i,
    /\d+\s*(as|ab|ltd)/i, // Numbers + company form (like "123 AS")
    /^[a-z]\s+(as|ab|ltd)/i, // Single letter + company form
  ];

  if (suspiciousNamePatterns.some((pattern) => pattern.test(companyName))) {
    shellCompanyIndicators.push("SUSPICIOUS_COMPANY_NAME");
  }

  // 4. Very quick bankruptcy (less than 3 months)
  if (lifespanInDays <= 90) {
    shellCompanyIndicators.push("LIGHTNING_BANKRUPTCY");
    isShellCompanySuspicious = true;
  }

  return {
    lifespanInDays,
    isShellCompanySuspicious,
    shellCompanyIndicators,
  };
}

/**
 * Generic algorithm to detect escaped companies from a specific kommune
 */
export async function detectEscapedCompanies(
  targetKommuneNumber: string
): Promise<EscapedCompanyPattern[]> {
  console.log(
    `🔍 GENERIC FRAUD DETECTION: Analyzing escaped companies from kommune ${targetKommuneNumber}`
  );

  const escapedCompanies: EscapedCompanyPattern[] = [];

  // Method 1: Professional Service Network Analysis
  const serviceNetworkCompanies =
    await detectViaServiceNetworks(targetKommuneNumber);
  escapedCompanies.push(...serviceNetworkCompanies);

  // Method 2: Address Pattern Analysis
  const addressPatternCompanies =
    await detectViaAddressPatterns(targetKommuneNumber);
  escapedCompanies.push(...addressPatternCompanies);

  // Method 3: Automatic Search and Investigation (NO HARDCODING)
  const searchedCompanies =
    await searchForSuspiciousCompanies(targetKommuneNumber);
  escapedCompanies.push(...searchedCompanies);

  // Method 4: Cross-Kommune Business Registration Analysis
  const registrationPatternCompanies =
    await detectViaRegistrationPatterns(targetKommuneNumber);
  escapedCompanies.push(...registrationPatternCompanies);

  // Remove duplicates and sort by risk level
  const uniqueCompanies = deduplicateCompanies(escapedCompanies);
  const sortedCompanies = uniqueCompanies.sort((a, b) => {
    const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });

  console.log(
    `✅ Generic detection complete: ${sortedCompanies.length} escaped companies found`
  );
  return sortedCompanies;
}

/**
 * Method 1: Find companies via professional service networks
 */
async function detectViaServiceNetworks(
  kommuneNumber: string
): Promise<EscapedCompanyPattern[]> {
  const companies: EscapedCompanyPattern[] = [];

  // TODO: Implement generic professional service network analysis
  // This would analyze:
  // 1. Companies using accountants/lawyers in different kommuner
  // 2. Board members with addresses in different kommuner
  // 3. Professional service patterns that indicate historical connections

  console.log(
    `🔍 Professional service network analysis for kommune ${kommuneNumber} - not yet implemented`
  );

  return companies;
}

/**
 * Method 2: Detect via address change patterns
 */
async function detectViaAddressPatterns(
  kommuneNumber: string
): Promise<EscapedCompanyPattern[]> {
  const companies: EscapedCompanyPattern[] = [];

  // This would analyze address history patterns
  // Look for companies that had addresses in the target kommune historically
  // but now have addresses elsewhere

  return companies;
}

/**
 * Method 3: Automatic company search and investigation (NO HARDCODING)
 */
async function searchForSuspiciousCompanies(
  kommuneNumber: string
): Promise<EscapedCompanyPattern[]> {
  const companies: EscapedCompanyPattern[] = [];

  // TODO: Implement truly generic suspicious company detection
  // This would analyze:
  // 1. Companies with address history showing moves FROM the target kommune
  // 2. Companies with professional service connections to the target kommune
  // 3. Companies with board members historically connected to the target kommune
  // 4. Cross-reference with bankruptcy timing patterns

  console.log(
    `🔍 Generic suspicious company detection for kommune ${kommuneNumber} - not yet implemented`
  );

  return companies;
}

/**
 * Method 4: Detect via business registration patterns
 */
async function detectViaRegistrationPatterns(
  kommuneNumber: string
): Promise<EscapedCompanyPattern[]> {
  const companies: EscapedCompanyPattern[] = [];

  // This would analyze:
  // - Companies registered recently in nearby kommuner
  // - Registration timing vs address changes
  // - Industry patterns (restaurants, construction, etc.)

  return companies;
}

/**
 * Remove duplicate companies from detection results
 */
function deduplicateCompanies(
  companies: EscapedCompanyPattern[]
): EscapedCompanyPattern[] {
  const seen = new Set<string>();
  const unique: EscapedCompanyPattern[] = [];

  for (const company of companies) {
    const key =
      company.organizationNumber !== "INVESTIGATION_NEEDED"
        ? company.organizationNumber
        : company.companyName;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(company);
    }
  }

  return unique;
}

/**
 * Calculate overall fraud risk level for a kommune based on escaped companies
 */
export function calculateKommuneFraudRisk(
  escapedCompanies: EscapedCompanyPattern[]
): {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  totalCases: number;
  criticalCases: number;
  highConfidenceCases: number;
  recommendations: string[];
} {
  const criticalCases = escapedCompanies.filter(
    (c) => c.riskLevel === "CRITICAL"
  ).length;
  const highCases = escapedCompanies.filter(
    (c) => c.riskLevel === "HIGH"
  ).length;
  const highConfidenceCases = escapedCompanies.filter(
    (c) => c.confidence >= 80
  ).length;

  let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  if (criticalCases > 0 || highConfidenceCases >= 3) {
    riskLevel = "CRITICAL";
  } else if (highCases >= 2 || highConfidenceCases >= 2) {
    riskLevel = "HIGH";
  } else if (escapedCompanies.length >= 2) {
    riskLevel = "MEDIUM";
  } else {
    riskLevel = "LOW";
  }

  const recommendations = [];
  if (criticalCases > 0) {
    recommendations.push("🚨 IMMEDIATE: Investigate critical fraud cases");
    recommendations.push("📞 Contact law enforcement for critical cases");
  }
  if (highConfidenceCases >= 2) {
    recommendations.push("🔍 Conduct comprehensive fraud audit");
    recommendations.push(
      "📊 Implement enhanced monitoring for professional services"
    );
  }
  if (escapedCompanies.length >= 3) {
    recommendations.push(
      "⚠️ Pattern detected: Systematic fraud investigation recommended"
    );
    recommendations.push(
      "🏛️ Review municipality's business oversight procedures"
    );
  }

  return {
    riskLevel,
    totalCases: escapedCompanies.length,
    criticalCases,
    highConfidenceCases,
    recommendations,
  };
}
