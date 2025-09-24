import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Streaming Bulk Import - Import all Norwegian companies using streaming
 *
 * Processes the large JSON file line by line to avoid memory issues
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
    logProgress("INITIALIZATION", "starting", "Starting streaming bulk import");

    const filePath = path.join(process.cwd(), "assets", "enheter_alle.json");

    if (!fs.existsSync(filePath)) {
      throw new Error("enheter_alle.json file not found in assets folder");
    }

    const fileStats = fs.statSync(filePath);
    logProgress("FILE_ANALYSIS", "completed", "File analysis completed", {
      fileSizeMB: Math.round(fileStats.size / (1024 * 1024)),
      filePath: "assets/enheter_alle.json",
    });

    // Stream process the file
    logProgress(
      "STREAMING_PROCESS",
      "starting",
      "Starting streaming file processing"
    );

    const result = await streamProcessFile(filePath);

    logProgress(
      "STREAMING_PROCESS",
      "completed",
      "Streaming processing completed",
      result
    );

    const totalTime = Date.now() - startTime;

    logProgress(
      "COMPLETION",
      "completed",
      `Streaming import completed in ${Math.round(totalTime / 1000)}s`,
      {
        totalTime: `${Math.round(totalTime / 1000)}s`,
        processingRate: `${Math.round(result.totalProcessed / (totalTime / 1000))} entities/second`,
      }
    );

    return NextResponse.json({
      success: true,
      statistics: {
        entitiesProcessed: result.totalProcessed,
        companiesSaved: result.totalSaved,
        errors: result.totalErrors,
        processingTime: `${Math.round(totalTime / 1000)}s`,
        successRate: `${Math.round((result.totalSaved / result.totalProcessed) * 100)}%`,
      },
      progress: progressLog,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    logProgress("ERROR", "error", `Streaming import failed: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: "Streaming import failed",
        message: errorMessage,
        progress: progressLog,
      },
      { status: 500 }
    );
  }
}

async function streamProcessFile(filePath: string) {
  let totalProcessed = 0;
  let totalSaved = 0;
  let totalErrors = 0;
  let batchBuffer: any[] = [];
  const batchSize = 500;

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let isFirstLine = true;
  let isLastLine = false;

  for await (const line of rl) {
    try {
      // Skip the opening bracket
      if (isFirstLine && line.trim() === "[") {
        isFirstLine = false;
        continue;
      }

      // Skip the closing bracket
      if (line.trim() === "]") {
        isLastLine = true;
        break;
      }

      // Clean the line (remove trailing comma)
      let cleanLine = line.trim();
      if (cleanLine.endsWith(",")) {
        cleanLine = cleanLine.slice(0, -1);
      }

      // Skip empty lines
      if (!cleanLine || cleanLine === "{" || cleanLine === "}") {
        continue;
      }

      // Try to parse as JSON object
      let entity;
      try {
        entity = JSON.parse(cleanLine);
      } catch (parseError) {
        // If single line fails, might be part of multi-line object
        continue;
      }

      if (entity && entity.organisasjonsnummer) {
        batchBuffer.push(entity);
        totalProcessed++;

        // Process batch when it reaches batch size
        if (batchBuffer.length >= batchSize) {
          const batchResult = await processBatch(batchBuffer);
          totalSaved += batchResult.saved;
          totalErrors += batchResult.errors;

          logProgress(
            "BATCH_PROCESSING",
            "in_progress",
            `Processed ${totalProcessed} entities`,
            {
              batchSaved: batchResult.saved,
              batchErrors: batchResult.errors,
              totalSaved,
              totalErrors,
              successRate: `${Math.round((totalSaved / totalProcessed) * 100)}%`,
            }
          );

          batchBuffer = []; // Clear buffer
        }
      }
    } catch (error) {
      totalErrors++;
      console.error("Line processing error:", error);
    }
  }

  // Process remaining entities in buffer
  if (batchBuffer.length > 0) {
    const batchResult = await processBatch(batchBuffer);
    totalSaved += batchResult.saved;
    totalErrors += batchResult.errors;
  }

  return { totalProcessed, totalSaved, totalErrors };
}

async function processBatch(entities: any[]) {
  let saved = 0;
  let errors = 0;

  for (const entity of entities) {
    try {
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

      // Upsert to database
      await prisma.company.upsert({
        where: { organizationNumber: companyData.organizationNumber },
        update: companyData,
        create: companyData,
      });

      saved++;
    } catch (error) {
      errors++;
      console.error(
        `Failed to process entity ${entity.organisasjonsnummer}:`,
        error
      );
    }
  }

  return { saved, errors };
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
    service: "Streaming Bulk Import",
    description:
      "Import all Norwegian companies using streaming to handle large files",
    usage: "POST to start streaming import",
    features: [
      "✅ Streaming file processing (handles large files)",
      "✅ Batch processing for performance",
      "✅ Progress tracking",
      "✅ Error handling",
      "✅ Upsert logic (update existing, create new)",
    ],
    fileInfo: {
      expectedFile: "assets/enheter_alle.json",
      format: "Array of BRREG entities",
      processingMethod: "Line-by-line streaming",
    },
    timestamp: new Date().toISOString(),
  });
}
