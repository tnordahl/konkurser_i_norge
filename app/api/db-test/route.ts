import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Database Test API - Simple Prisma connection test
 *
 * Tests basic database operations to identify Prisma issues
 */

export async function POST(request: NextRequest) {
  try {
    console.log("🔍 Starting database connection test...");

    // Test 1: Basic connection
    console.log("📊 Test 1: Basic connection test...");
    const connectionTest = await prisma.$queryRaw`SELECT 1 as test`;
    console.log("✅ Basic connection successful:", connectionTest);

    // Test 2: Count existing records
    console.log("📊 Test 2: Counting existing records...");
    const counts = {
      kommuner: await prisma.kommune.count(),
      companies: await prisma.company.count(),
      addressHistory: await prisma.companyAddressHistory.count(),
      postalCodes: await prisma.kommunePostalCode.count(),
    };
    console.log("✅ Record counts successful:", counts);

    // Test 3: Simple create operation
    console.log("📊 Test 3: Testing simple create operation...");
    const testKommune = await prisma.kommune.upsert({
      where: { kommuneNumber: "9999" },
      update: { name: "Test Kommune Updated" },
      create: {
        kommuneNumber: "9999",
        name: "Test Kommune",
        county: "Test County",
      },
    });
    console.log("✅ Create/update successful:", testKommune);

    // Test 4: Simple read operation
    console.log("📊 Test 4: Testing simple read operation...");
    const testRead = await prisma.kommune.findUnique({
      where: { kommuneNumber: "9999" },
    });
    console.log("✅ Read successful:", testRead);

    // Test 5: Clean up test data
    console.log("📊 Test 5: Cleaning up test data...");
    await prisma.kommune.delete({
      where: { kommuneNumber: "9999" },
    });
    console.log("✅ Cleanup successful");

    return NextResponse.json({
      success: true,
      test: "Database Connection Test",
      results: {
        connectionTest: "✅ PASSED",
        countTest: "✅ PASSED",
        createTest: "✅ PASSED",
        readTest: "✅ PASSED",
        cleanupTest: "✅ PASSED",
      },
      currentCounts: counts,
      message: "All database operations working correctly!",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Database test failed:", error);

    return NextResponse.json(
      {
        success: false,
        test: "Database Connection Test",
        error: "Database test failed",
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        troubleshooting: [
          "Check database connection string in .env",
          "Verify Prisma client is properly generated",
          "Ensure database schema is up to date",
          "Check for any schema mismatches",
        ],
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    test: "Database Test Status",
    description: "Tests basic Prisma database operations",
    usage: "POST to run database connection tests",
    tests: [
      "Basic database connection",
      "Record counting operations",
      "Create/upsert operations",
      "Read operations",
      "Delete operations",
    ],
    timestamp: new Date().toISOString(),
  });
}
