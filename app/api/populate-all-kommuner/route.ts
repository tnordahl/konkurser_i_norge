import { NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import { KommuneService } from "@/lib/kommune-service";

export async function POST() {
  try {
    console.log("🏛️ Starting population of all Norwegian kommuner...");

    const kommuneService = KommuneService.getInstance();
    const allKommuner = kommuneService.getAllKommuner();

    console.log(`📊 Found ${allKommuner.length} kommuner to populate`);

    let created = 0;
    let updated = 0;

    for (const kommune of allKommuner) {
      const result = await prisma.kommune.upsert({
        where: { kommuneNumber: kommune.number },
        update: {
          name: kommune.name,
          county: kommune.county,
          region: kommune.region,
          priority: kommune.priority,
        },
        create: {
          kommuneNumber: kommune.number,
          name: kommune.name,
          county: kommune.county,
          region: kommune.region,
          priority: kommune.priority,
        },
      });

      // Check if it was created or updated
      const existing = await prisma.kommune.findFirst({
        where: {
          kommuneNumber: kommune.number,
          createdAt: { lt: new Date(Date.now() - 1000) }, // Created more than 1 second ago
        },
      });

      if (existing) {
        updated++;
      } else {
        created++;
      }
    }

    console.log(
      `✅ Successfully populated kommuner: ${created} created, ${updated} updated`
    );

    // Get final count
    const totalKommuner = await prisma.kommune.count();

    return NextResponse.json({
      success: true,
      message: "All Norwegian kommuner have been populated in the database",
      stats: {
        totalKommuner,
        created,
        updated,
        sourceKommuner: allKommuner.length,
      },
      features: [
        "✅ All 356 Norwegian kommuner",
        "✅ Complete regional information",
        "✅ Priority classifications",
        "✅ County mappings",
        "✅ Ready for data collection",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to populate kommuner:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        troubleshooting: [
          "Check database connection",
          "Verify Prisma schema is up to date",
          "Ensure KommuneService is properly configured",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const kommuneService = KommuneService.getInstance();
    const allKommuner = kommuneService.getAllKommuner();
    const dbKommuner = await prisma.kommune.count();

    return NextResponse.json({
      success: true,
      sourceKommuner: allKommuner.length,
      databaseKommuner: dbKommuner,
      needsPopulation: dbKommuner < allKommuner.length,
      message:
        dbKommuner < allKommuner.length
          ? "Database needs to be populated with all kommuner"
          : "Database is up to date with all kommuner",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Failed to check kommune status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
