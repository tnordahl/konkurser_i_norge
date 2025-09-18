import { NextRequest, NextResponse } from "next/server";
import { CompanyDataManager } from "@/lib/company-database";

export async function GET(
  request: NextRequest,
  { params }: { params: { personName: string } }
) {
  const personName = decodeURIComponent(params.personName);

  console.log(`🔍 Starting person network analysis for: ${personName}`);

  try {
    const companyManager = CompanyDataManager.getInstance();
    const networkData = await companyManager.getPersonNetwork(personName);

    console.log(`✅ Person network analysis complete for ${personName}:`);
    console.log(`   📊 Connected companies: ${networkData.companies.length}`);
    console.log(
      `   🚨 Suspicious patterns: ${networkData.suspiciousPatterns.length}`
    );
    console.log(`   ⚠️  Risk score: ${Math.round(networkData.riskScore)}`);

    return NextResponse.json({
      success: true,
      person: personName,
      companies: networkData.companies,
      suspiciousPatterns: networkData.suspiciousPatterns,
      riskScore: networkData.riskScore,
      summary: {
        totalCompanies: networkData.companies.length,
        highRiskCompanies: networkData.companies.filter(
          (c) => c.riskScore >= 70
        ).length,
        criticalRiskCompanies: networkData.companies.filter(
          (c) => c.riskScore >= 80
        ).length,
        averageRiskScore:
          networkData.companies.length > 0
            ? networkData.companies.reduce((sum, c) => sum + c.riskScore, 0) /
              networkData.companies.length
            : 0,
      },
    });
  } catch (error) {
    console.error(`Person network analysis failed for ${personName}:`, error);
    return NextResponse.json(
      {
        success: false,
        error: "Person network analysis failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
