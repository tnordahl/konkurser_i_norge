import { NextRequest, NextResponse } from "next/server";

/**
 * Total Companies in Norway API
 *
 * GET /api/total-companies-norway - Get the total number of companies in Norway from official API
 */

export async function GET(request: NextRequest) {
  try {
    console.log(
      "📊 Fetching total company count from Brønnøysundregistrene..."
    );
    const startTime = Date.now();

    // Get first page with size=1 to get total count from metadata
    const url =
      "https://data.brreg.no/enhetsregisteret/api/enheter?page=0&size=1";

    console.log(`📡 Fetching from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    // Extract pagination metadata
    const totalElements = data.page?.totalElements || 0;
    const totalPages = data.page?.totalPages || 0;
    const pageSize = data.page?.size || 1;
    const currentPage = data.page?.number || 0;

    const processingTime = Date.now() - startTime;

    console.log(
      `📈 Total companies in Norway: ${totalElements.toLocaleString()}`
    );

    return NextResponse.json({
      success: true,
      officialData: {
        totalCompaniesInNorway: totalElements,
        totalPages: totalPages,
        pageSize: pageSize,
        currentPage: currentPage,
      },
      ourDatabase: {
        totalCompaniesStored: "Use /api/company-stats to get this number",
        storagePercentage: "Will be calculated when we know our count",
      },
      metadata: {
        source: "Brønnøysundregistrene Official API",
        url: url,
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Total companies error:", error);
    return NextResponse.json(
      {
        error: "Failed to get total company count",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
