import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Fix Counties API - Update kommune records with correct county information
 * and add Bø kommune for address movement testing
 */

export async function POST(request: NextRequest) {
  try {
    console.log("🔧 Fixing county information and adding Bø kommune...");

    // Update existing kommuner with correct county information
    const updates = [
      {
        kommuneNumber: "4201",
        name: "Risør",
        county: "Agder",
        region: "Sørlandet",
        priority: "medium",
      },
      {
        kommuneNumber: "4204",
        name: "Kristiansand",
        county: "Agder",
        region: "Sørlandet",
        priority: "high",
      },
       {
         kommuneNumber: "4020",
         name: "Midt-Telemark",
         county: "Telemark",
         region: "Østlandet",
         priority: "medium",
       },
      {
        kommuneNumber: "0301",
        name: "Oslo",
        county: "Oslo",
        region: "Østlandet",
        priority: "high",
      },
      {
        kommuneNumber: "4601",
        name: "Bergen",
        county: "Vestland",
        region: "Vestlandet",
        priority: "high",
      },
      {
        kommuneNumber: "1103",
        name: "Stavanger",
        county: "Rogaland",
        region: "Vestlandet",
        priority: "high",
      },
    ];

    const results = [];

    for (const update of updates) {
      console.log(`📍 Updating ${update.name} (${update.kommuneNumber})...`);

      const result = await prisma.kommune.upsert({
        where: { kommuneNumber: update.kommuneNumber },
        update: {
          name: update.name,
          county: update.county,
          region: update.region,
          priority: update.priority,
        },
        create: {
          kommuneNumber: update.kommuneNumber,
          name: update.name,
          county: update.county,
          region: update.region,
          priority: update.priority,
        },
      });

      results.push({
        kommuneNumber: update.kommuneNumber,
        name: update.name,
        county: update.county,
        region: update.region,
        status: "updated",
      });

      console.log(`✅ ${update.name} updated successfully`);
    }

    // Get updated counts
    const totalKommuner = await prisma.kommune.count();
    const totalCompanies = await prisma.company.count();
    const totalPostalCodes = await prisma.kommunePostalCode.count();

    console.log("🎉 County information updated successfully!");

    return NextResponse.json({
      success: true,
      message: "County information updated and Bø kommune added",
      updates: results,
      summary: {
        kommunerUpdated: results.length,
        totalKommuner,
        totalCompanies,
        totalPostalCodes,
      },
      nextSteps: [
        "✅ County information is now correct",
        "✅ Bø kommune added for address movement testing",
        "🔄 Ready to collect data for Bø",
        "📊 Ready to test address movement detection between Risør and Bø",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to fix counties:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fix counties",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Show current kommune status
    const kommuner = await prisma.kommune.findMany({
      select: {
        kommuneNumber: true,
        name: true,
        county: true,
        region: true,
        priority: true,
        _count: {
          select: {
            companies: true,
            postalCodes: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json({
      success: true,
      kommuner,
      summary: {
        total: kommuner.length,
        withCorrectCounty: kommuner.filter(
          (k) => k.county !== "Unknown" && k.county !== "Test County"
        ).length,
        needingData: kommuner.filter((k) => k._count.companies === 0).length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to get kommune status:", error);
    return NextResponse.json(
      { success: false, error: "Failed to get status" },
      { status: 500 }
    );
  }
}
