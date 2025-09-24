import { NextRequest, NextResponse } from "next/server";
import {
  optimizedCompanyService,
  CompanyData,
} from "@/lib/optimized-company-service";

/**
 * Quick Population API - Fast test with just one API call
 *
 * POST /api/quick-populate - Populate with one page of companies quickly
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { pageSize = 20, page = 0 } = body;

    console.log(
      `🚀 Quick populate: fetching ${pageSize} companies from page ${page}...`
    );
    const startTime = Date.now();

    // Single API call to Brønnøysundregistrene
    const url = `https://data.brreg.no/enhetsregisteret/api/enheter?page=${page}&size=${pageSize}&sort=organisasjonsnummer,asc`;

    console.log(`📡 Fetching from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const companies = data._embedded?.enheter || [];

    console.log(`📦 Received ${companies.length} companies from API`);

    if (companies.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No companies found",
        timestamp: new Date().toISOString(),
      });
    }

    // Convert to our format
    const companyData: CompanyData[] = companies.map((enhet: any) => ({
      organizationNumber: enhet.organisasjonsnummer,
      name: enhet.navn,
      organizationForm: enhet.organisasjonsform?.kode,
      status: enhet.konkurs ? "Bankruptcy" : "Active",
      registrationDate: enhet.registreringsdatoEnhetsregisteret
        ? new Date(enhet.registreringsdatoEnhetsregisteret)
        : undefined,
      industry: enhet.naeringskode1?.beskrivelse,
      industryCode: enhet.naeringskode1?.kode,
      businessAddress: enhet.forretningsadresse,
      postalAddress: enhet.postadresse,
      isBankrupt: enhet.konkurs || false,
      riskScore: calculateQuickRiskScore(enhet),
    }));

    console.log(`🔄 Saving ${companyData.length} companies to database...`);

    // Use optimized batch save
    const saveResult = await optimizedCompanyService.batchSaveCompanies(
      companyData,
      "0000" // Default kommune for national import
    );

    const totalTime = Date.now() - startTime;

    console.log(`✅ Quick populate complete in ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      message: `Quick populate completed successfully`,
      processingTimeMs: totalTime,
      results: {
        companiesReceived: companies.length,
        companiesProcessed: saveResult.totalProcessed,
        newCompanies: saveResult.newCompanies,
        updatedCompanies: saveResult.updatedCompanies,
        errors: saveResult.errors.length,
        avgTimePerCompany: Math.round(totalTime / companies.length),
      },
      sampleCompanies: companyData.slice(0, 3).map((c) => ({
        organizationNumber: c.organizationNumber,
        name: c.name,
        organizationForm: c.organizationForm,
        riskScore: c.riskScore,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Quick populate error:", error);
    return NextResponse.json(
      {
        error: "Failed to quick populate",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Simple risk score calculation
function calculateQuickRiskScore(enhet: any): number {
  let score = 0;

  // Bankruptcy risk
  if (enhet.konkurs) score += 50;

  // Recent registration (shell company risk)
  if (enhet.registreringsdatoEnhetsregisteret) {
    const regDate = new Date(enhet.registreringsdatoEnhetsregisteret);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    if (regDate > oneYearAgo) score += 10;
  }

  // Address mismatch
  if (
    enhet.forretningsadresse?.kommunenummer !== enhet.postadresse?.kommunenummer
  ) {
    score += 10;
  }

  return Math.min(score, 100);
}
