import { NextRequest, NextResponse } from "next/server";

/**
 * Simple Test API - Basic functionality test
 *
 * Tests just the API fetching without database operations
 */

export async function POST(request: NextRequest) {
  try {
    const { kommuneNumber = "4201", maxEntities = 3 } = await request.json();

    console.log(
      `🧪 SIMPLE TEST: Fetching ${maxEntities} entities from kommune ${kommuneNumber}...`
    );
    const startTime = Date.now();

    // Test API connectivity
    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=${maxEntities}&page=0`;

    console.log(`📥 [${new Date().toISOString()}] Fetching from: ${url}`);

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "konkurser-i-norge-simple-test/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const entities = data._embedded?.enheter || [];

    const totalTime = Date.now() - startTime;

    console.log(
      `✅ [${new Date().toISOString()}] Successfully fetched ${entities.length} entities in ${totalTime}ms`
    );

    // Analyze the entities
    const analysis = entities.map((entity: any, index: number) => ({
      index: index + 1,
      organizationNumber: entity.organisasjonsnummer,
      name: entity.navn,
      organizationForm: entity.organisasjonsform?.kode,
      isBankrupt: !!entity.konkurs,
      hasBusinessAddress: !!entity.forretningsadresse,
      hasPostalAddress: !!entity.postadresse,
      businessAddress: entity.forretningsadresse
        ? {
            address: entity.forretningsadresse.adresse?.[0],
            postalCode: entity.forretningsadresse.postnummer,
            city: entity.forretningsadresse.poststed,
            kommuneNumber: entity.forretningsadresse.kommunenummer,
          }
        : null,
      postalAddress: entity.postadresse
        ? {
            address: entity.postadresse.adresse?.[0],
            postalCode: entity.postadresse.postnummer,
            city: entity.postadresse.city,
            kommuneNumber: entity.postadresse.kommunenummer,
          }
        : null,
      industry: entity.naeringskode1?.beskrivelse,
      industryCode: entity.naeringskode1?.kode,
      registrationDate: entity.registreringsdatoEnhetsregisteret,
    }));

    return NextResponse.json({
      success: true,
      test: "Simple API Test",
      input: {
        kommuneNumber,
        maxEntities,
        url,
      },
      apiResponse: {
        entitiesFetched: entities.length,
        totalAvailable: data.page?.totalElements || "unknown",
        pageInfo: {
          number: data.page?.number || 0,
          size: data.page?.size || 0,
          totalPages: data.page?.totalPages || "unknown",
        },
      },
      entities: analysis,
      dataQuality: {
        entitiesWithBusinessAddress: analysis.filter(
          (e) => e.hasBusinessAddress
        ).length,
        entitiesWithPostalAddress: analysis.filter((e) => e.hasPostalAddress)
          .length,
        bankruptEntities: analysis.filter((e) => e.isBankrupt).length,
        entitiesWithIndustry: analysis.filter((e) => e.industry).length,
        uniquePostalCodes: [
          ...new Set(
            analysis.map((e) => e.businessAddress?.postalCode).filter(Boolean)
          ),
        ],
      },
      performance: {
        totalTime: `${totalTime}ms`,
        avgTimePerEntity:
          entities.length > 0
            ? `${Math.round(totalTime / entities.length)}ms`
            : "0ms",
        entitiesPerSecond:
          entities.length > 0
            ? Math.round(entities.length / (totalTime / 1000))
            : 0,
      },
      insights: [
        `📊 Successfully fetched ${entities.length} real entities from Brønnøysundregistrene`,
        `🏢 ${analysis.filter((e) => e.hasBusinessAddress).length}/${entities.length} entities have business addresses`,
        `📮 ${analysis.filter((e) => e.hasPostalAddress).length}/${entities.length} entities have postal addresses`,
        `💼 ${analysis.filter((e) => e.industry).length}/${entities.length} entities have industry information`,
        `⚡ API response time: ${totalTime}ms`,
        entities.length > 0
          ? "✅ API connectivity is working!"
          : "❌ No entities returned",
      ],
      nextSteps:
        entities.length > 0
          ? [
              "✅ API connectivity confirmed",
              "🔄 Ready to test database operations",
              "📊 Data structure looks correct",
              "🚀 Can proceed with full data processing",
            ]
          : [
              "🔍 Check kommune number validity",
              "🌐 Verify API endpoint availability",
              "📋 Review API parameters",
            ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Simple test failed:", error);

    return NextResponse.json(
      {
        success: false,
        test: "Simple API Test",
        error: "Test failed",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    test: "Simple Test Status",
    description: "Tests API connectivity without database operations",
    usage: "POST with { kommuneNumber: '4201', maxEntities: 3 }",
    availableKommuner: ["4201", "0301", "4601"], // Risør, Oslo, Bergen
    timestamp: new Date().toISOString(),
  });
}
