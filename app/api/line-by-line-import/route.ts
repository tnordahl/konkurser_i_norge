import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { optimizedCompanyService } from "@/lib/optimized-company-service";

/**
 * Line-by-Line Import - Import all Norwegian companies by reading file line by line
 *
 * Processes the large JSON file without loading it entirely into memory
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
    logProgress("INITIALIZATION", "starting", "Starting line-by-line import");

    const filePath = path.join(process.cwd(), "assets", "enheter_alle.json");

    if (!fs.existsSync(filePath)) {
      throw new Error("enheter_alle.json file not found in assets folder");
    }

    const fileStats = fs.statSync(filePath);
    logProgress("FILE_ANALYSIS", "completed", "File analysis completed", {
      fileSizeMB: Math.round(fileStats.size / (1024 * 1024)),
      filePath: "assets/enheter_alle.json",
    });

    // Process file line by line
    logProgress(
      "LINE_PROCESSING",
      "starting",
      "Starting line-by-line processing"
    );

    const result = await processFileLineByLine(filePath);

    logProgress(
      "LINE_PROCESSING",
      "completed",
      "Line processing completed",
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
      message: "Line-by-line import completed successfully",
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

async function processFileLineByLine(filePath: string) {
  let totalProcessed = 0;
  let totalSaved = 0;
  let totalErrors = 0;

  const batchSize = 500; // Process 500 entities at a time
  let entityBuffer: any[] = [];
  let lineNumber = 0;
  let insideEntity = false;
  let currentEntity = "";
  let braceCount = 0;

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  logProgress("STREAM_SETUP", "completed", "File stream initialized");

  for await (const line of rl) {
    lineNumber++;

    // Skip the opening array bracket
    if (lineNumber === 1 && line.trim() === "[") {
      continue;
    }

    // Skip the closing array bracket
    if (line.trim() === "]") {
      break;
    }

    // Track braces to identify complete JSON objects
    for (const char of line) {
      if (char === "{") {
        if (!insideEntity) {
          insideEntity = true;
          currentEntity = "";
          braceCount = 0;
        }
        braceCount++;
        currentEntity += char;
      } else if (char === "}") {
        if (insideEntity) {
          currentEntity += char;
          braceCount--;

          if (braceCount === 0) {
            // Complete entity found
            try {
              const entity = JSON.parse(currentEntity);
              if (entity && entity.organisasjonsnummer) {
                entityBuffer.push(entity);
                totalProcessed++;

                // Process batch when buffer is full
                if (entityBuffer.length >= batchSize) {
                  const batchResult = await processBatch(entityBuffer);
                  totalSaved += batchResult.saved;
                  totalErrors += batchResult.errors;

                  if (totalProcessed % 5000 === 0) {
                    logProgress(
                      "PROGRESS_UPDATE",
                      "in_progress",
                      `Processed ${totalProcessed} entities`,
                      {
                        totalProcessed,
                        totalSaved,
                        totalErrors,
                        successRate: `${Math.round((totalSaved / totalProcessed) * 100)}%`,
                        currentLine: lineNumber,
                      }
                    );
                  }

                  entityBuffer = [];
                }
              }
            } catch (parseError) {
              totalErrors++;
              console.error(
                `JSON parse error at line ${lineNumber}:`,
                parseError
              );
            }

            insideEntity = false;
            currentEntity = "";
          }
        }
      } else if (insideEntity) {
        currentEntity += char;
      }
    }
  }

  // Process remaining entities in buffer
  if (entityBuffer.length > 0) {
    const batchResult = await processBatch(entityBuffer);
    totalSaved += batchResult.saved;
    totalErrors += batchResult.errors;
  }

  return { totalProcessed, totalSaved, totalErrors };
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
      await optimizedCompanyService.batchSaveCompanies(companiesToSave);
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
    service: "Line-by-Line Import",
    description:
      "Import all Norwegian companies by reading file line by line without memory overflow",
    usage: "POST to start import",
    features: [
      "✅ Memory-efficient line-by-line processing",
      "✅ JSON object boundary detection",
      "✅ Batch processing with progress tracking",
      "✅ Comprehensive error handling",
      "✅ Optimized database operations",
    ],
  });
}
