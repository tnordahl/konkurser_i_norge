import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { orgNumber: string } }
) {
  const orgNumber = params.orgNumber;

  try {
    console.log(`🕵️‍♂️ DETECTIVE MODE: Investigating company ${orgNumber}`);

    // Fetch detailed company information
    const enhetsregisterUrl = `https://data.brreg.no/enhetsregisteret/api/enheter/${orgNumber}`;

    const response = await fetch(enhetsregisterUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-detective/1.0",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: "Company not found" },
        { status: 404 }
      );
    }

    const companyData = await response.json();

    // Analyze for fraud patterns
    const investigation = await performDetectiveAnalysis(companyData);

    return NextResponse.json({
      success: true,
      company: {
        name: companyData.navn,
        organizationNumber: companyData.organisasjonsnummer,
        organizationForm: companyData.organisasjonsform?.beskrivelse,
        industry: companyData.naeringskode1?.beskrivelse,
        registrationDate: companyData.registreringsdatoEnhetsregisteret,
        status: companyData.slettedato ? "DELETED/BANKRUPT" : "ACTIVE",
      },
      addresses: {
        business: formatAddress(companyData.forretningsadresse),
        postal: formatAddress(companyData.postadresse),
        businessKommune: companyData.forretningsadresse?.kommunenummer,
        postalKommune: companyData.postadresse?.kommunenummer,
      },
      investigation,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`❌ Investigation failed for ${orgNumber}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Investigation failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function performDetectiveAnalysis(companyData: any) {
  const suspiciousPatterns: string[] = [];
  const connections: any[] = [];
  let fraudRiskLevel = "LOW";

  // Pattern 1: Address Mismatch Analysis
  const businessAddr = companyData.forretningsadresse;
  const postAddr = companyData.postadresse;

  const businessKommune = businessAddr?.kommunenummer;
  const postKommune = postAddr?.kommunenummer;

  if (businessKommune !== postKommune) {
    suspiciousPatterns.push("CROSS_KOMMUNE_ADDRESSES");
    fraudRiskLevel = "MEDIUM";
  }

  // Pattern 2: Recent Registration Analysis
  if (companyData.registreringsdatoEnhetsregisteret) {
    const regDate = new Date(companyData.registreringsdatoEnhetsregisteret);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    if (regDate > oneYearAgo) {
      suspiciousPatterns.push("RECENT_REGISTRATION");
      fraudRiskLevel = "MEDIUM";
    }
  }

  // Pattern 3: High-Risk Industry Analysis
  const industryCode = companyData.naeringskode1?.kode;
  const highRiskIndustries = ["55.100", "47.110", "68.100", "70.220"]; // Hotels, retail, real estate, consulting

  if (highRiskIndustries.includes(industryCode)) {
    suspiciousPatterns.push("HIGH_RISK_INDUSTRY");
  }

  // Pattern 4: Generic cross-kommune professional service analysis
  if (businessKommune && postKommune && businessKommune !== postKommune) {
    suspiciousPatterns.push("CROSS_KOMMUNE_ADDRESSES");

    const addressAnalysis = {
      type: "ADDRESS_ANALYSIS",
      significance: `Business in ${businessKommune}, postal in ${postKommune} - potential professional service network`,
      riskLevel: "MEDIUM",
    };
    connections.push(addressAnalysis);

    if (fraudRiskLevel === "LOW") fraudRiskLevel = "MEDIUM";
  }

  // Pattern 5: Generic major city migration analysis
  const majorCities = ["0301", "1103", "4601"]; // Oslo, Stavanger, Bergen
  const isMajorCityMove =
    majorCities.includes(businessKommune || "") &&
    postKommune &&
    !majorCities.includes(postKommune);

  if (isMajorCityMove) {
    suspiciousPatterns.push("MAJOR_CITY_MIGRATION");
    if (fraudRiskLevel === "LOW") fraudRiskLevel = "MEDIUM";
  }

  const investigation = {
    fraudRiskLevel,
    suspiciousPatterns,
    connections,
    recommendations: generateRecommendations(
      suspiciousPatterns,
      fraudRiskLevel
    ),
    addressChangeAnalysis: {
      hasAddressMismatch: businessKommune !== postKommune,
      possibleMigration: businessKommune === "0301" && postKommune !== "0301",
      crossKommunePattern: businessKommune !== postKommune,
    },
    networkAnalysis: {
      professionalServices: connections.filter(
        (c) => c.type === "ACCOUNTANT" || c.type === "AUDITOR"
      ),
      keyPersons: connections.filter((c) => c.type === "KEY_PERSON"),
      corporateStructure: connections.filter((c) => c.type === "SUBSIDIARY"),
    },
  };

  return investigation;
}

function generateRecommendations(
  patterns: string[],
  riskLevel: string
): string[] {
  const recommendations = [];

  if (riskLevel === "HIGH" || riskLevel === "CRITICAL") {
    recommendations.push("🚨 IMMEDIATE INVESTIGATION REQUIRED");
    recommendations.push("📊 Audit financial records for last 2 years");
    recommendations.push("🔍 Verify all address changes and timing");
  }

  if (patterns.includes("CROSS_KOMMUNE_ADDRESSES")) {
    recommendations.push("📍 Investigate reason for address mismatch");
    recommendations.push("🏛️ Check tax obligations in both municipalities");
  }

  if (patterns.includes("AGDER_TO_OSLO_MIGRATION")) {
    recommendations.push(
      "🚚 Investigate timing of Oslo move vs business events"
    );
    recommendations.push("💼 Check if Agder operations continued after move");
  }

  if (patterns.includes("HIGH_RISK_INDUSTRY")) {
    recommendations.push("💰 Monitor cash flow patterns closely");
    recommendations.push(
      "📋 Verify business activity matches registered purpose"
    );
  }

  return recommendations;
}

function formatAddress(addr: any): string {
  if (!addr) return "";
  const parts = [];
  if (addr.adresse?.length) parts.push(addr.adresse.join(" "));
  if (addr.postnummer) parts.push(addr.postnummer);
  if (addr.poststed) parts.push(addr.poststed);
  return parts.join(", ");
}
