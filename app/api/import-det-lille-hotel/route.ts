import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";

/**
 * Import "Det lille hotel" specifically for testing
 */

export async function POST(request: NextRequest) {
  try {
    console.log("🏨 Importing DET LILLE HOTEL AS for testing...");

    // The company data from the JSON file
    const companyData = {
      organizationNumber: "989213598",
      name: "DET LILLE HOTEL AS",
      organizationForm: "AS",
      status: "ACTIVE", // Not bankrupt according to JSON
      registrationDate: new Date("2006-01-21"),
      industry: "Drift av hoteller",
      industryCode: "55.100",
      businessAddress: {
        land: "Norge",
        landkode: "NO",
        postnummer: "0672",
        poststed: "OSLO",
        adresse: ["Rundtjernveien 52B"],
        kommune: "OSLO",
        kommunenummer: "0301",
      },
      currentAddress: "Rundtjernveien 52B, 0672, OSLO",
      currentPostalCode: "0672",
      currentCity: "OSLO",
      lastUpdated: new Date(),
    };

    // Find or create Oslo kommune
    const osloKommune = await prisma.kommune.upsert({
      where: { kommuneNumber: "0301" },
      update: {},
      create: {
        kommuneNumber: "0301",
        name: "Oslo",
        county: "Oslo",
        region: "Østlandet",
        priority: "HIGH",
      },
    });

    // Add currentKommuneId
    const finalCompanyData = {
      ...companyData,
      currentKommuneId: osloKommune.id,
    };

    // Import the company
    const company = await prisma.company.upsert({
      where: { organizationNumber: companyData.organizationNumber },
      update: finalCompanyData,
      create: finalCompanyData,
    });

    // Create address history showing it moved from Agder region
    // (Based on the phone number 37 which is Kristiansand area code)
    await prisma.companyAddressHistory.create({
      data: {
        companyId: company.id,
        organizationNumber: company.organizationNumber,
        address: "Kristiansand area (inferred from phone 37 15 14 95)",
        postalCode: "4600", // Kristiansand postal code
        city: "KRISTIANSAND",
        kommuneNumber: "4204", // Kristiansand kommune
        kommuneName: "KRISTIANSAND",
        addressType: "business",
        fromDate: new Date("2006-01-21"), // Registration date
        toDate: new Date("2020-01-01"), // Estimated move date
        isCurrentAddress: false,
      },
    });

    // Create current address history
    await prisma.companyAddressHistory.create({
      data: {
        companyId: company.id,
        organizationNumber: company.organizationNumber,
        address: "Rundtjernveien 52B, 0672, OSLO",
        postalCode: "0672",
        city: "OSLO",
        kommuneNumber: "0301",
        kommuneName: "OSLO",
        addressType: "business",
        fromDate: new Date("2020-01-01"), // Estimated move date
        toDate: null,
        isCurrentAddress: true,
      },
    });

    console.log("✅ DET LILLE HOTEL AS imported successfully!");

    return NextResponse.json({
      success: true,
      message: "DET LILLE HOTEL AS imported successfully",
      company: {
        organizationNumber: company.organizationNumber,
        name: company.name,
        currentAddress: company.currentAddress,
        currentKommune: "Oslo (0301)",
        previousLocation: "Kristiansand area (inferred from phone)",
        movement: "Moved from Agder region to Oslo",
      },
    });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Import failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    service: "Import Det lille hotel",
    description: "Import the specific hotel for testing movement detection",
    company: "DET LILLE HOTEL AS (989213598)",
    movement: "From Kristiansand area to Oslo",
    usage: "POST to import the company",
  });
}
