import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import * as fs from "fs";
import * as path from "path";

/**
 * Bulk Import JSON - Import all Norwegian companies from enheter_alle.json
 *
 * This endpoint imports the complete dataset of Norwegian companies
 * Plain dump into database without risk profiles or complex processing
 */

interface ImportProgress {
  phase: string;
  status: "starting" | "in_progress" | "completed" | "error";
  message: string;
  data?: any;
  timestamp: string;
}

let progressLog: ImportProgress[] = [];

function logProgress(
  phase: string,
  status: ImportProgress["status"],
  message: string,
  data?: any
) {
  const entry: ImportProgress = {
    phase,
    status,
    message,
    data,
    timestamp: new Date().toISOString(),
  };

  progressLog.push(entry);

  const timeStr = entry.timestamp.split("T")[1].split(".")[0];
  const statusEmoji = {
    starting: "🚀",
    in_progress: "⚙️",
    completed: "✅",
    error: "❌",
  }[status];

  console.log(`[${timeStr}] ${statusEmoji} ${phase}: ${message}`);
  if (data && Object.keys(data).length > 0) {
    console.log(`    └─ ${JSON.stringify(data, null, 2)}`);
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  progressLog = [];

  try {
    logProgress(
      "INITIALIZATION",
      "starting",
      "Starting bulk import from enheter_alle.json"
    );

    // Step 1: Load JSON file
    logProgress("FILE_LOADING", "starting", "Loading JSON file");
    const filePath = path.join(process.cwd(), "assets", "enheter_alle.json");

    if (!fs.existsSync(filePath)) {
      throw new Error("enheter_alle.json file not found in assets folder");
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    const entities = JSON.parse(fileContent);

    logProgress("FILE_LOADING", "completed", "JSON file loaded successfully", {
      entitiesFound: entities.length,
      fileSizeMB: Math.round(fs.statSync(filePath).size / (1024 * 1024)),
    });

    // Step 2: Process in batches
    logProgress("BATCH_PROCESSING", "starting", "Starting batch processing");

    const batchSize = 1000;
    const totalBatches = Math.ceil(entities.length / batchSize);
    let totalProcessed = 0;
    let totalSaved = 0;
    let totalErrors = 0;

    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      logProgress(
        "BATCH_PROCESSING",
        "in_progress",
        `Processing batch ${batchNumber}/${totalBatches}`,
        {
          batchSize: batch.length,
          progress: `${Math.round((i / entities.length) * 100)}%`,
          totalProcessed,
          totalSaved,
          totalErrors,
        }
      );

      const batchResults = await processBatch(batch);
      totalProcessed += batchResults.processed;
      totalSaved += batchResults.saved;
      totalErrors += batchResults.errors;
    }

    logProgress("BATCH_PROCESSING", "completed", "Batch processing completed", {
      totalProcessed,
      totalSaved,
      totalErrors,
      successRate: `${Math.round((totalSaved / totalProcessed) * 100)}%`,
    });

    const totalTime = Date.now() - startTime;

    logProgress(
      "COMPLETION",
      "completed",
      `Bulk import completed in ${Math.round(totalTime / 1000)}s`,
      {
        entitiesProcessed: totalProcessed,
        companiesSaved: totalSaved,
        errors: totalErrors,
        processingRate: `${Math.round(totalProcessed / (totalTime / 1000))} entities/second`,
      }
    );

    return NextResponse.json({
      success: true,
      statistics: {
        entitiesProcessed: totalProcessed,
        companiesSaved: totalSaved,
        errors: totalErrors,
        processingTime: `${Math.round(totalTime / 1000)}s`,
        successRate: `${Math.round((totalSaved / totalProcessed) * 100)}%`,
      },
      progress: progressLog,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logProgress("ERROR", "error", `Bulk import failed: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: "Bulk import failed",
        message: errorMessage,
        progress: progressLog,
      },
      { status: 500 }
    );
  }
}

async function processBatch(entities: any[]) {
  let processed = 0;
  let saved = 0;
  let errors = 0;

  const companiesToSave = [];

  for (const entity of entities) {
    try {
      processed++;

      // Map entity to company data (plain dump, no risk processing)
      const companyData = {
        organizationNumber: entity.organisasjonsnummer,
        name: entity.navn,
        organizationForm: entity.organisasjonsform?.kode,
        status: entity.konkurs ? "BANKRUPTCY" : "ACTIVE",
        registrationDate: entity.registreringsdatoEnhetsregisteret
          ? new Date(entity.registreringsdatoEnhetsregisteret)
          : undefined,
        industry: entity.naeringskode1?.beskrivelse,
        industryCode: entity.naeringskode1?.kode,
        businessAddress: entity.forretningsadresse,
        postalAddress: entity.postadresse,
        currentAddress: formatAddress(entity.forretningsadresse),
        currentPostalCode: entity.forretningsadresse?.postnummer,
        currentCity: entity.forretningsadresse?.poststed,
        lastUpdated: new Date(),
      };

      companiesToSave.push(companyData);
    } catch (error) {
      errors++;
      console.error(
        `Failed to process entity ${entity.organisasjonsnummer}:`,
        error
      );
    }
  }

  // Batch save to database
  try {
    for (const companyData of companiesToSave) {
      await prisma.company.upsert({
        where: { organizationNumber: companyData.organizationNumber },
        update: companyData,
        create: companyData,
      });
      saved++;
    }
  } catch (error) {
    console.error("Batch save error:", error);
    errors += companiesToSave.length;
  }

  return { processed, saved, errors };
}

function formatAddress(addressObj: any): string {
  if (!addressObj) return "";
  const parts = [
    addressObj.adresse?.[0],
    addressObj.postnummer,
    addressObj.poststed,
  ].filter(Boolean);
  return parts.join(", ");
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    success: true,
    service: "Bulk Import JSON",
    description: "Import all Norwegian companies from enheter_alle.json",
    usage: "POST to start bulk import",
    features: [
      "✅ Plain dump into database (no risk processing)",
      "✅ Batch processing for performance",
      "✅ Progress tracking",
      "✅ Error handling",
      "✅ Upsert logic (update existing, create new)",
    ],
    fileInfo: {
      expectedFile: "assets/enheter_alle.json",
      format: "Array of BRREG entities",
    },
    timestamp: new Date().toISOString(),
  });
}
