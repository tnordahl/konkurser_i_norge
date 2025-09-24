import { NextRequest, NextResponse } from "next/server";
import { optimizedCompanyService } from "@/lib/optimized-company-service";

/**
 * Test endpoint for optimized company service
 *
 * GET /api/test-optimized-companies?kommune=4201 - Test getting cached connections
 * POST /api/test-optimized-companies - Test batch saving companies
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const kommuneNumber = searchParams.get("kommune");

  if (!kommuneNumber) {
    return NextResponse.json(
      { error: "Kommune number required" },
      { status: 400 }
    );
  }

  try {
    const startTime = Date.now();

    // Test getting cached connections
    const connections =
      await optimizedCompanyService.getCachedConnections(kommuneNumber);

    // Test getting companies by kommune
    const companies = await optimizedCompanyService.getCompaniesByKommune(
      kommuneNumber,
      {
        page: 1,
        limit: 10,
        includeRiskAlerts: true,
        minRiskScore: 0,
      }
    );

    const processingTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      kommuneNumber,
      processingTimeMs: processingTime,
      data: {
        cachedConnections: {
          count: connections.length,
          connections: connections.slice(0, 5), // Show first 5
        },
        companiesByKommune: {
          count: companies.companies.length,
          pagination: companies.pagination,
          companies: companies.companies.slice(0, 3), // Show first 3
        },
      },
      metadata: {
        cacheStrategy: "optimized_service",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Test optimized companies error:", error);
    return NextResponse.json(
      {
        error: "Failed to test optimized company service",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { kommuneNumber, testData } = body;

    if (!kommuneNumber) {
      return NextResponse.json(
        { error: "Kommune number required" },
        { status: 400 }
      );
    }

    const startTime = Date.now();

    // Test batch saving with sample data
    const sampleCompanies = testData || [
      {
        organizationNumber: "999999999",
        name: "TEST COMPANY AS",
        organizationForm: "AS",
        status: "Active",
        industry: "Software development",
        industryCode: "62.010",
        riskScore: 25,
        businessAddress: {
          adresse: ["Testveien 1"],
          postnummer: "4950",
          poststed: "Risør",
          kommunenummer: kommuneNumber,
        },
      },
      {
        organizationNumber: "888888888",
        name: "ANOTHER TEST AS",
        organizationForm: "AS",
        status: "Active",
        industry: "Consulting",
        industryCode: "70.220",
        riskScore: 75,
        businessAddress: {
          adresse: ["Konsulentgata 2"],
          postnummer: "4950",
          poststed: "Risør",
          kommunenummer: kommuneNumber,
        },
      },
    ];

    // Test batch save
    const saveResult = await optimizedCompanyService.batchSaveCompanies(
      sampleCompanies,
      kommuneNumber
    );

    // Test batch save connections
    const sampleConnections = [
      {
        organizationNumber: "999999999",
        name: "TEST COMPANY AS",
        currentAddress: "Testveien 1, 4950 Risør",
        connection: {
          type: "POSTAL_ADDRESS",
          evidence: `Test connection to kommune ${kommuneNumber}`,
          confidence: "HIGH" as const,
          discoveredAt: new Date(),
        },
        riskScore: 25,
        riskAlerts: [
          {
            alertType: "TEST_ALERT",
            riskLevel: "MEDIUM",
            title: "Test Risk Alert",
            description: "This is a test risk alert",
            metadata: { testData: true },
          },
        ],
      },
    ];

    const connectionResult = await optimizedCompanyService.batchSaveConnections(
      sampleConnections,
      kommuneNumber
    );

    const totalProcessingTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      kommuneNumber,
      totalProcessingTimeMs: totalProcessingTime,
      results: {
        batchSaveCompanies: saveResult,
        batchSaveConnections: connectionResult,
      },
      metadata: {
        testType: "batch_operations",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Test batch save error:", error);
    return NextResponse.json(
      {
        error: "Failed to test batch save",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
