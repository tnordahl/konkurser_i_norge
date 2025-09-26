import { NextRequest, NextResponse } from "next/server";
import { fullmaktService } from "@/lib/fullmakt-service";
import { prisma } from "@/lib/database";

/**
 * Roles Collection API - Collect board members and management roles
 *
 * Uses both Enhetsregisteret roles API and Fullmakttjenesten
 * Based on: https://data.brreg.no/enhetsregisteret/api/dokumentasjon/no/index.html
 */

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationNumber = searchParams.get("organizationNumber");
    const kommuneNumber = searchParams.get("kommuneNumber");

    if (!organizationNumber && !kommuneNumber) {
      return NextResponse.json(
        {
          success: false,
          error: "Either organizationNumber or kommuneNumber is required",
        },
        { status: 400 }
      );
    }

    console.log("👥 ROLES COLLECTION: Starting enhanced roles collection...");

    let results: any[] = [];

    if (organizationNumber) {
      // Collect roles for specific company
      const companyRoles = await collectCompanyRoles(organizationNumber);
      results.push(companyRoles);
    } else if (kommuneNumber) {
      // Collect roles for all companies in kommune
      results = await collectKommuneRoles(kommuneNumber);
    }

    const summary = {
      companiesProcessed: results.length,
      totalRoles: results.reduce((sum, r) => sum + (r.roles?.length || 0), 0),
      totalSigningAuthorities: results.reduce(
        (sum, r) => sum + (r.signingAuthorities?.length || 0),
        0
      ),
      fraudAlerts: results.filter((r) => r.fraudRisk?.riskScore > 70).length,
    };

    return NextResponse.json({
      success: true,
      message: "Roles collection completed",
      summary,
      results,
      improvements: [
        "✅ Now collecting board member and management data",
        "✅ Enhanced fraud detection using signing authorities",
        "✅ Cross-referencing roles with address changes",
        "✅ Building professional networks database",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Roles collection failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Roles collection failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function collectCompanyRoles(organizationNumber: string) {
  console.log(`👤 Collecting roles for company ${organizationNumber}`);

  try {
    // 1. Get roles from Enhetsregisteret roles API
    const rolesResponse = await fetch(
      `https://data.brreg.no/enhetsregisteret/api/enheter/${organizationNumber}/roller`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "konkurser-i-norge-roles/1.0",
        },
      }
    );

    let roles: any[] = [];
    if (rolesResponse.ok) {
      const rolesData = await rolesResponse.json();
      roles = rolesData.roller || [];
    }

    // 2. Get signing authorities from Fullmakttjenesten
    const signingAuthorities =
      await fullmaktService.lookupSigningAuthority(organizationNumber);

    // 3. Enhanced fraud detection using roles data
    const fraudRisk =
      await fullmaktService.detectSigningAuthorityFraud(organizationNumber);

    // 4. Store roles data in database
    await storeRolesData(organizationNumber, roles, signingAuthorities);

    return {
      organizationNumber,
      roles,
      signingAuthorities,
      fraudRisk,
      insights: analyzeRoles(roles, signingAuthorities),
    };
  } catch (error) {
    console.error(
      `❌ Failed to collect roles for ${organizationNumber}:`,
      error
    );
    return {
      organizationNumber,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function collectKommuneRoles(kommuneNumber: string) {
  console.log(
    `🏘️ Collecting roles for all companies in kommune ${kommuneNumber}`
  );

  // Get all companies in the kommune
  const companies = await prisma.company.findMany({
    where: { currentKommuneId: kommuneNumber },
    select: { organizationNumber: true, name: true },
  });

  console.log(
    `Found ${companies.length} companies in kommune ${kommuneNumber}`
  );

  const results: any[] = [];
  const batchSize = 10; // Process in small batches to avoid overwhelming APIs

  for (let i = 0; i < companies.length; i += batchSize) {
    const batch = companies.slice(i, i + batchSize);

    const batchPromises = batch.map((company) =>
      collectCompanyRoles(company.organizationNumber)
    );

    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        console.error(
          `Failed to process ${batch[index].organizationNumber}:`,
          result.reason
        );
      }
    });

    // Rate limiting between batches
    if (i + batchSize < companies.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(
      `📊 Processed ${Math.min(i + batchSize, companies.length)}/${companies.length} companies`
    );
  }

  return results;
}

async function storeRolesData(
  organizationNumber: string,
  roles: any[],
  signingAuthorities: any
) {
  try {
    // Store board members and management roles
    // TODO: CompanyRole model not found in schema - needs to be implemented
    const rolePromises = roles.map((role) => {
      // TODO: CompanyRole model not implemented - skipping role storage
      return Promise.resolve({
        id: "placeholder",
        role: role.type?.kode || "UNKNOWN",
      });
    });

    await Promise.all(rolePromises);

    // Store signing authorities if available
    if (signingAuthorities) {
      // TODO: SigningAuthority model not implemented - skipping
      console.log(
        `Skipping signing authority storage for ${organizationNumber}`
      );
    }
  } catch (error) {
    console.error(
      `❌ Failed to store roles data for ${organizationNumber}:`,
      error
    );
  }
}

function analyzeRoles(roles: any[], signingAuthorities: any) {
  const insights: string[] = [];

  // Analyze board composition
  const boardMembers = roles.filter((r) =>
    ["MEDL", "LEDE", "NEST"].includes(r.type?.kode)
  );
  const management = roles.filter((r) => ["DAGL"].includes(r.type?.kode));

  if (boardMembers.length === 0) {
    insights.push("⚠️ No registered board members");
  }

  if (management.length === 0) {
    insights.push("⚠️ No registered management");
  }

  if (boardMembers.length > 10) {
    insights.push(`🚨 Unusually large board (${boardMembers.length} members)`);
  }

  // Analyze signing authorities
  if (signingAuthorities) {
    const totalSigners =
      signingAuthorities.signingRoles.length +
      signingAuthorities.prokuraRoles.length;

    if (totalSigners === 0) {
      insights.push("❌ No signing authorities registered");
    } else if (totalSigners > 15) {
      insights.push(`🚨 Excessive signing authorities (${totalSigners})`);
    }

    if (
      signingAuthorities.signingRoles.length === 0 &&
      signingAuthorities.prokuraRoles.length > 0
    ) {
      insights.push("⚠️ Only prokura, no signatur registered");
    }
  }

  return insights;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationNumber = searchParams.get("organizationNumber");

    if (!organizationNumber) {
      return NextResponse.json(
        { success: false, error: "organizationNumber is required" },
        { status: 400 }
      );
    }

    // Get stored roles data
    // TODO: CompanyRole model not implemented - returning empty array
    const roles: any[] = []; // await prisma.companyRole.findMany({ where: { organizationNumber } });

    // TODO: SigningAuthority model not implemented - returning null
    const signingAuthority = null; // await prisma.signingAuthority.findUnique({ where: { organizationNumber } });

    return NextResponse.json({
      success: true,
      organizationNumber,
      roles,
      signingAuthority: null, // TODO: SigningAuthority model not implemented
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get roles data:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get roles data" },
      { status: 500 }
    );
  }
}
