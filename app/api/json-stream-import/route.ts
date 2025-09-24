import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/database";
import * as fs from "fs";
import * as path from "path";

/**
 * JSON Stream Import - Import all Norwegian companies using JSON streaming
 *
 * Uses a proper JSON streaming parser to handle the large file
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
    logProgress("INITIALIZATION", "starting", "Starting JSON stream import");

    const filePath = path.join(process.cwd(), "assets", "enheter_alle.json");

    if (!fs.existsSync(filePath)) {
      throw new Error("enheter_alle.json file not found in assets folder");
    }

    const fileStats = fs.statSync(filePath);
    logProgress("FILE_ANALYSIS", "completed", "File analysis completed", {
      fileSizeMB: Math.round(fileStats.size / (1024 * 1024)),
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
      statistics: {
        entitiesProcessed: result.totalProcessed,
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

  const chunkSize = 1024 * 1024; // 1MB chunks
  const batchSize = 100; // Process 100 entities at a time

  let buffer = "";
  let entityBuffer: any[] = [];
  let braceCount = 0;
  let inEntity = false;
  let currentEntity = "";

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });

  for await (const chunk of fileStream) {
    buffer += chunk;

    let i = 0;
    while (i < buffer.length) {
      const char = buffer[i];

      if (char === "{") {
        if (!inEntity) {
          inEntity = true;
          currentEntity = "";
          braceCount = 0;
        }
        braceCount++;
        currentEntity += char;
      } else if (char === "}") {
        if (inEntity) {
          currentEntity += char;
          braceCount--;

          if (braceCount === 0) {
            // Complete entity found
            try {
              const entity = JSON.parse(currentEntity);
              if (entity.organisasjonsnummer) {
                entityBuffer.push(entity);
                totalProcessed++;

                // Process batch when buffer is full
                if (entityBuffer.length >= batchSize) {
                  const batchResult = await processBatch(entityBuffer);
                  totalSaved += batchResult.saved;
                  totalErrors += batchResult.errors;

                  if (totalProcessed % 1000 === 0) {
                    logProgress(
                      "BATCH_PROCESSING",
                      "in_progress",
                      `Processed ${totalProcessed} entities`,
                      {
                        totalSaved,
                        totalErrors,
                        successRate: `${Math.round((totalSaved / totalProcessed) * 100)}%`,
                      }
                    );
                  }

                  entityBuffer = [];
                }
              }
            } catch (parseError) {
              totalErrors++;
              console.error("JSON parse error:", parseError);
            }

            inEntity = false;
            currentEntity = "";
          }
        }
      } else if (inEntity) {
        currentEntity += char;
      }

      i++;
    }

    // Keep only the incomplete entity in buffer
    if (inEntity) {
      buffer = currentEntity;
    } else {
      buffer = "";
    }
  }

  // Process remaining entities
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

  // Use optimized batch processing
  const companiesToSave = [];

  for (const entity of entities) {
    try {
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

  // Batch upsert
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
    service: "JSON Stream Import",
    description:
      "Import all Norwegian companies using efficient JSON streaming",
    usage: "POST to start import",
    features: [
      "✅ Chunk-based file processing",
      "✅ JSON entity parsing",
      "✅ Batch database operations",
      "✅ Progress tracking",
      "✅ Memory efficient",
    ],
    fileInfo: {
      expectedFile: "assets/enheter_alle.json",
      format: "JSON array of BRREG entities",
      processingMethod: "Streaming with entity detection",
    },
    timestamp: new Date().toISOString(),
  });
}
