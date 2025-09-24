import { NextResponse } from "next/server";
import { prisma } from "@/lib/database";

export async function GET() {
  try {
    console.log("🔍 Fetching all kommuner with enhanced data...");
    
    // Get all kommuner first
    const kommuner = await prisma.kommune.findMany({
      select: {
        id: true,
        kommuneNumber: true,
        name: true,
        county: true,
        region: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            bankruptcies: true,
            postalCodes: true,
            addressChanges: true,
          },
        },
        // Get postal codes for coverage info
        postalCodes: {
          take: 5,
          select: {
            postalCode: true,
            city: true,
          },
          where: {
            isActive: true,
          },
          orderBy: {
            postalCode: 'asc',
          },
        },
      },
      orderBy: [
        { priority: 'asc' }, // High priority first
        { name: 'asc' },
      ],
    });

    // Get company counts by kommune number (since companies aren't directly linked to kommune table)
    const companyCounts = await prisma.company.groupBy({
      by: ['currentCity'],
      _count: {
        id: true,
      },
      where: {
        currentCity: {
          not: null,
        },
      },
    });

    // Get sample companies for each kommune
    const sampleCompaniesByKommune = await Promise.all(
      kommuner.map(async (kommune) => {
        // Find companies by matching city names or postal codes
        const companies = await prisma.company.findMany({
          where: {
            OR: [
              { currentCity: { contains: kommune.name, mode: 'insensitive' } },
              { 
                currentPostalCode: {
                  in: kommune.postalCodes.map(pc => pc.postalCode)
                }
              },
            ],
          },
          select: {
            name: true,
            organizationNumber: true,
            status: true,
            industry: true,
          },
          take: 3,
          orderBy: {
            lastUpdated: 'desc',
          },
        });
        
        return {
          kommuneNumber: kommune.kommuneNumber,
          companies,
          count: companies.length > 0 ? await prisma.company.count({
            where: {
              OR: [
                { currentCity: { contains: kommune.name, mode: 'insensitive' } },
                { 
                  currentPostalCode: {
                    in: kommune.postalCodes.map(pc => pc.postalCode)
                  }
                },
              ],
            },
          }) : 0,
        };
      })
    );

    console.log(`✅ Found ${kommuner.length} kommuner with enhanced data`);

    // Transform data for frontend compatibility
    const enhancedKommuner = kommuner.map(kommune => {
      const kompanyData = sampleCompaniesByKommune.find(sc => sc.kommuneNumber === kommune.kommuneNumber);
      const companyCount = kompanyData?.count || 0;
      
      return {
        // Original fields for compatibility
        id: kommune.kommuneNumber,
        name: kommune.name,
        county: kommune.county,
        bankruptcyCount: kommune._count.bankruptcies,
        
        // Enhanced fields
        region: kommune.region,
        priority: kommune.priority,
        companyCount,
        postalCodeCount: kommune._count.postalCodes,
        addressChangeCount: kommune._count.addressChanges,
        
        // Sample data for preview
        sampleCompanies: kompanyData?.companies || [],
        postalCodes: kommune.postalCodes,
        
        // Status indicators
        hasData: companyCount > 0,
        dataQuality: companyCount > 0 ? 
          (kommune._count.postalCodes > 0 ? 'excellent' : 'good') : 'none',
        
        // Timestamps
        lastUpdated: kommune.updatedAt,
        dataCollectedAt: kommune.createdAt,
      };
    });

    // Calculate summary statistics
    const stats = {
      totalKommuner: kommuner.length,
      kommunerWithData: enhancedKommuner.filter(k => k.hasData).length,
      totalCompanies: enhancedKommuner.reduce((sum, k) => sum + k.companyCount, 0),
      totalBankruptcies: enhancedKommuner.reduce((sum, k) => sum + k.bankruptcyCount, 0),
      totalPostalCodes: enhancedKommuner.reduce((sum, k) => sum + k.postalCodeCount, 0),
      dataQualityDistribution: {
        excellent: enhancedKommuner.filter(k => k.dataQuality === 'excellent').length,
        good: enhancedKommuner.filter(k => k.dataQuality === 'good').length,
        none: enhancedKommuner.filter(k => k.dataQuality === 'none').length,
      },
    };

    return NextResponse.json({
      success: true,
      count: kommuner.length,
      kommuner: enhancedKommuner,
      stats,
      features: [
        "✅ Complete company data with counts",
        "✅ Postal code coverage information", 
        "✅ Address change tracking",
        "✅ Data quality indicators",
        "✅ Sample company previews",
        "✅ Priority-based sorting",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to fetch kommuner:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        troubleshooting: [
          "Check database connection",
          "Verify Prisma schema is up to date",
          "Ensure kommuner table exists with data",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
