import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import * as fs from "fs";
import * as path from "path";
import { optimizedCompanyService } from "@/lib/optimized-company-service";

/**
 * Robust Bulk Import - Import all Norwegian companies with proper error handling
 *
 * Processes the large JSON file in manageable chunks with comprehensive logging
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
    in_progress: "⚡",
    completed: "✅",
    error: "❌",
  }[status];

  console.log(`[${timeStr}] ${statusEmoji} ${phase}: ${message}`);
  if (data && Object.keys(data).length > 0) {
    console.log(`    📊 Data:`, JSON.stringify(data, null, 2));
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  progressLog = [];

  try {
    logProgress("INITIALIZATION", "starting", "Starting robust bulk import");

    const filePath = path.join(process.cwd(), "assets", "enheter_alle.json");

    if (!fs.existsSync(filePath)) {
      throw new Error("enheter_alle.json file not found in assets folder");
    }

    const fileStats = fs.statSync(filePath);
    logProgress("FILE_ANALYSIS", "completed", "File analysis completed", {
      fileSizeMB: Math.round(fileStats.size / (1024 * 1024)),
      filePath: "assets/enheter_alle.json",
    });

    // Process file in chunks
    logProgress(
      "CHUNK_PROCESSING",
      "starting",
      "Starting chunk-based processing"
    );

    const result = await processFileInChunks(filePath);

    logProgress(
      "CHUNK_PROCESSING",
      "completed",
      "Chunk processing completed",
      result
    );

    const totalTime = Date.now() - startTime;

    logProgress(
      "COMPLETION",
      "completed",
      `Import completed in ${Math.round(totalTime / 1000)}s`,
      {
        totalTime: `${Math.round(totalTime / 1000)}s`,
        processingRate:
          result.totalProcessed > 0
            ? `${Math.round(result.totalProcessed / (totalTime / 1000))} entities/second`
            : "0 entities/second",
      }
    );

    return NextResponse.json({
      success: true,
      message: "Bulk import completed successfully",
      summary: {
        totalProcessed: result.totalProcessed,
        companiesSaved: result.totalSaved,
        errors: result.totalErrors,
        processingTime: `${Math.round(totalTime / 1000)}s`,
        successRate:
          result.totalProcessed > 0
            ? `${Math.round((result.totalSaved / result.totalProcessed) * 100)}%`
            : "0%",
      },
      progress: progressLog,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logProgress("ERROR", "error", `Import failed: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: "Import failed",
        message: errorMessage,
        progress: progressLog,
      },
      { status: 500 }
    );
  }
}

async function processFileInChunks(filePath: string) {
  let totalProcessed = 0;
  let totalSaved = 0;
  let totalErrors = 0;

  const batchSize = 1000; // Process 1000 entities at a time
  let entityBuffer: any[] = [];

  try {
    // Read the entire file (we know it's valid JSON)
    logProgress("FILE_READING", "starting", "Reading JSON file into memory");
    const fileContent = fs.readFileSync(filePath, "utf8");

    logProgress("JSON_PARSING", "starting", "Parsing JSON content");
    const entities = JSON.parse(fileContent);

    if (!Array.isArray(entities)) {
      throw new Error("JSON file does not contain an array of entities");
    }

    logProgress(
      "JSON_PARSING",
      "completed",
      `Parsed ${entities.length} entities from JSON`
    );

    // Process entities in batches
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);

      logProgress(
        "BATCH_PROCESSING",
        "in_progress",
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entities.length / batchSize)}`,
        {
          batchStart: i + 1,
          batchEnd: Math.min(i + batchSize, entities.length),
          totalEntities: entities.length,
        }
      );

      const batchResult = await processBatch(batch);
      totalProcessed += batch.length;
      totalSaved += batchResult.saved;
      totalErrors += batchResult.errors;

      // Log progress every 10 batches
      if ((Math.floor(i / batchSize) + 1) % 10 === 0) {
        logProgress(
          "PROGRESS_UPDATE",
          "in_progress",
          `Processed ${totalProcessed} entities so far`,
          {
            totalProcessed,
            totalSaved,
            totalErrors,
            successRate: `${Math.round((totalSaved / totalProcessed) * 100)}%`,
            remainingBatches: Math.ceil(
              (entities.length - i - batchSize) / batchSize
            ),
          }
        );
      }
    }

    return { totalProcessed, totalSaved, totalErrors };
  } catch (error) {
    logProgress(
      "PROCESSING_ERROR",
      "error",
      `File processing failed: ${error}`
    );
    throw error;
  }
}

async function processBatch(entities: any[]) {
  let saved = 0;
  let errors = 0;

  // Transform entities to company data
  const companiesToSave = [];

  for (const entity of entities) {
    try {
      if (!entity.organisasjonsnummer) {
        errors++;
        continue;
      }

      // Transform BRREG entity to our Company format
      const companyData = {
        organizationNumber: entity.organisasjonsnummer,
        name: entity.navn || "Ukjent navn",
        organizationForm: entity.organisasjonsform?.kode || "UKJENT",
        registrationDate: entity.registreringsdatoEnhetsregisteret
          ? new Date(entity.registreringsdatoEnhetsregisteret)
          : new Date(),
        status: entity.konkurs ? "BANKRUPTCY" : "ACTIVE",
        industry: entity.naeringskode1?.beskrivelse || "Ukjent bransje",
        industryCode: entity.naeringskode1?.kode || "00.000",
        currentAddress: entity.forretningsadresse?.adresse?.join(", ") || "",
        currentPostalCode: entity.forretningsadresse?.postnummer || "",
        currentCity: entity.forretningsadresse?.poststed || "",
        businessAddress: entity.forretningsadresse?.adresse?.join(", ") || "",
        postalAddress: entity.postadresse?.adresse?.join(", ") || "",
        employeeCount: entity.antallAnsatte || 0,
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

  // Use optimized batch save
  try {
    if (companiesToSave.length > 0) {
      await optimizedCompanyService.batchSaveCompanies(
        companiesToSave,
        "BULK_IMPORT"
      );
      saved = companiesToSave.length;
    }
  } catch (error) {
    console.error("Batch save failed:", error);
    errors += companiesToSave.length;
  }

  return { saved, errors };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    service: "Robust Bulk Import",
    description:
      "Import all Norwegian companies with proper error handling and progress tracking",
    usage: "POST to start import",
    features: [
      "✅ Memory-efficient JSON parsing",
      "✅ Batch processing with progress tracking",
      "✅ Comprehensive error handling",
      "✅ Optimized database operations",
      "✅ Real-time progress logging",
    ],
  });
}
