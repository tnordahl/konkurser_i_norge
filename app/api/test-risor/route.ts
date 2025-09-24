import { NextRequest, NextResponse } from "next/server";
import { kommuneBasedBulkService } from "@/lib/kommune-based-bulk-service";
import { postalCodeService } from "@/lib/postal-code-service";
import { enhancedAddressDetector } from "@/lib/enhanced-address-detector";
import { prisma } from "@/lib/database";

/**
 * Test Risør API - Focused test for Risør kommune (4201)
 * 
 * Tests complete data collection with detailed logging
 * Verifies address history tracking is working
 */

export async function POST(request: NextRequest) {
  try {
    console.log("🧪 RISØR TEST: Starting focused test for Risør kommune (4201)...");
    const startTime = Date.now();

    // Test with Risør specifically
    const risorKommuneNumber = "4201";
    
    console.log(`🎯 Testing kommune ${risorKommuneNumber} (Risør)...`);

    // Download entities for Risør
    const entities = await (kommuneBasedBulkService as any).downloadKommuneEntities(risorKommuneNumber);
    console.log(`📊 Downloaded ${entities.length} entities for Risør`);

    // Process and save entities
    const processedCount = await (kommuneBasedBulkService as any).processKommuneEntities(
      entities, 
      risorKommuneNumber
    );
    console.log(`💾 Processed ${processedCount} entities for Risør`);

    const totalTime = Date.now() - startTime;

    // Get final database statistics
    const totalCompanies = await prisma.company.count();
    const risorCompanies = await prisma.company.count({
      where: {
        OR: [
          { currentCity: { contains: "Risør", mode: "insensitive" } },
          { currentAddress: { contains: "Risør", mode: "insensitive" } },
        ]
      }
    });

    // Get address history statistics
    const totalAddressHistory = await prisma.companyAddressHistory.count();
    const risorAddressHistory = await prisma.companyAddressHistory.count({
      where: {
        OR: [
          { city: { contains: "Risør", mode: "insensitive" } },
          { address: { contains: "Risør", mode: "insensitive" } },
          { kommuneNumber: risorKommuneNumber },
        ]
      }
    });

    // Get postal code statistics
    const risorPostalCodes = await postalCodeService.getPostalCodesForKommune(risorKommuneNumber);
    const postalCodeStats = await postalCodeService.getPostalCodeStats();

    // Test address change detection
    const addressStats = await enhancedAddressDetector.getAddressChangeStats(risorKommuneNumber);

    // Get sample companies from Risør
    const sampleCompanies = await prisma.company.findMany({
      where: {
        OR: [
          { currentCity: { contains: "Risør", mode: "insensitive" } },
          { currentAddress: { contains: "Risør", mode: "insensitive" } },
        ]
      },
      take: 5,
      select: {
        organizationNumber: true,
        name: true,
        currentAddress: true,
        currentCity: true,
        registrationDate: true,
        addressHistory: {
          select: {
            id: true,
            address: true,
            addressType: true,
            isCurrentAddress: true,
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      test: "Risør Kommune Test",
      kommuneNumber: risorKommuneNumber,
      results: {
        entitiesDownloaded: entities.length,
        entitiesProcessed: processedCount,
        processingTime: `${totalTime}ms`,
        efficiency: {
          entitiesPerSecond: Math.round(entities.length / (totalTime / 1000)),
          processingRate: `${Math.round(processedCount / (totalTime / 1000))} entities/sec`,
        }
      },
      databaseStats: {
        totalCompaniesInDB: totalCompanies,
        risorCompaniesFound: risorCompanies,
        totalAddressHistoryRecords: totalAddressHistory,
        risorAddressHistoryRecords: risorAddressHistory,
        risorPostalCodesCount: risorPostalCodes.length,
        totalPostalCodesInSystem: postalCodeStats.totalPostalCodes,
      },
      postalCodeData: {
        risorPostalCodes: risorPostalCodes.slice(0, 10), // Show first 10
        postalCodeStats,
      },
      addressChangeData: {
        addressStats,
        enhancedDetectionWorking: addressStats.companiesWithHistory > 0,
      },
      addressHistoryWorking: risorAddressHistory > 0,
      sampleCompanies: sampleCompanies.map(company => ({
        organizationNumber: company.organizationNumber,
        name: company.name,
        currentAddress: company.currentAddress,
        currentCity: company.currentCity,
        registrationDate: company.registrationDate,
        addressHistoryCount: company.addressHistory.length,
        hasAddressHistory: company.addressHistory.length > 0,
      })),
      insights: [
        `📊 Downloaded ${entities.length} entities from Brønnøysundregistrene`,
        `💾 Successfully processed ${processedCount} entities`,
        `🏠 Found ${risorCompanies} companies associated with Risør`,
        `📍 Created ${risorAddressHistory} address history records`,
        `📮 Collected ${risorPostalCodes.length} postal codes for Risør`,
        `🔍 Enhanced address detection: ${addressStats.companiesWithHistory} companies with history`,
        risorAddressHistory > 0 
          ? "✅ Address history tracking is WORKING!" 
          : "❌ Address history tracking is NOT working",
        risorPostalCodes.length > 0
          ? "✅ Postal code collection is WORKING!"
          : "❌ Postal code collection is NOT working",
        `⚡ Processing speed: ${Math.round(processedCount / (totalTime / 1000))} entities/second`,
      ],
      recommendations: risorAddressHistory === 0 ? [
        "🔍 Check database constraints and field mappings",
        "🐛 Debug address history saving logic",
        "📋 Verify Prisma schema matches database structure",
        "🧪 Test with a single entity to isolate the issue",
      ] : [
        "✅ Address history is working correctly",
        "🚀 Ready to scale to more kommuner",
        "📊 Consider running full dataset collection",
        "🔄 Set up daily incremental updates",
      ],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("❌ Risør test failed:", error);
    
    return NextResponse.json(
      {
        success: false,
        test: "Risør Kommune Test",
        error: "Test failed",
        message: error instanceof Error ? error.message : "Unknown error",
        troubleshooting: [
          "🔍 Check server logs for detailed error information",
          "🌐 Verify API connectivity to data.brreg.no",
          "💾 Check database connection and permissions",
          "📋 Ensure Prisma schema is up to date",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get current Risør data status
    const risorCompanies = await prisma.company.count({
      where: {
        OR: [
          { currentCity: { contains: "Risør", mode: "insensitive" } },
          { currentAddress: { contains: "Risør", mode: "insensitive" } },
        ]
      }
    });

    const risorAddressHistory = await prisma.companyAddressHistory.count({
      where: {
        OR: [
          { city: { contains: "Risør", mode: "insensitive" } },
          { address: { contains: "Risør", mode: "insensitive" } },
          { kommuneNumber: "4201" },
        ]
      }
    });

    return NextResponse.json({
      success: true,
      test: "Risør Status Check",
      currentStatus: {
        risorCompanies,
        risorAddressHistory,
        addressHistoryWorking: risorAddressHistory > 0,
      },
      actions: [
        "POST /api/test-risor - Run complete Risør test",
        "GET /api/address-history/[orgNumber] - Check specific company address history",
      ],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("❌ Failed to get Risør status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get status" },
      { status: 500 }
    );
  }
}
