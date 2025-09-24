import { NextRequest, NextResponse } from "next/server";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filePath = searchParams.get("file") || "assets/enheter_alle.json";
    const limit = parseInt(searchParams.get("limit") || "100");
    const targetKommune = searchParams.get("kommune") || "0301"; // Default to Oslo for backward compatibility
    const targetKommuneName = searchParams.get("kommuneName") || "OSLO"; // Default for backward compatibility

    console.log(
      `🔍 Analyzing companies for kommune ${targetKommune} in: ${filePath}`
    );

    const fullPath = path.resolve(filePath);
    const kommuneCompanies: any[] = [];
    let totalProcessed = 0;
    let kommuneCount = 0;

    return new Promise((resolve) => {
      const fileStream = createReadStream(fullPath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let currentEntity = "";
      let braceCount = 0;
      let inEntity = false;

      rl.on("line", (line) => {
        const trimmed = line.trim();

        if (trimmed.startsWith("{")) {
          inEntity = true;
          braceCount = 1;
          currentEntity = trimmed;
        } else if (inEntity) {
          currentEntity += "\n" + line;

          // Count braces to know when entity is complete
          for (const char of trimmed) {
            if (char === "{") braceCount++;
            if (char === "}") braceCount--;
          }

          if (braceCount === 0) {
            // Entity is complete
            try {
              // Remove trailing comma if present
              const cleanEntity = currentEntity.replace(/,\s*$/, "");
              const entity = JSON.parse(cleanEntity);

              totalProcessed++;

              // Check if this is a company in the target kommune (GENERIC)
              const isTargetKommune =
                entity.postadresse?.kommunenummer === targetKommune ||
                entity.postadresse?.kommune === targetKommuneName ||
                entity.forretningsadresse?.kommunenummer === targetKommune ||
                entity.forretningsadresse?.kommune === targetKommuneName;

              if (isTargetKommune) {
                kommuneCount++;
                if (kommuneCompanies.length < limit) {
                  kommuneCompanies.push({
                    organisasjonsnummer: entity.organisasjonsnummer,
                    navn: entity.navn,
                    organisasjonsform: entity.organisasjonsform?.beskrivelse,
                    postadresse: entity.postadresse,
                    forretningsadresse: entity.forretningsadresse,
                    registreringsdato: entity.registreringsdatoEnhetsregisteret,
                    konkurs: entity.konkurs,
                    underAvvikling: entity.underAvvikling,
                  });
                }
              }

              // Log progress every 50,000 entities
              if (totalProcessed % 50000 === 0) {
                console.log(
                  `📊 Processed: ${totalProcessed.toLocaleString()}, Kommune ${targetKommune} found: ${kommuneCount.toLocaleString()}`
                );
              }
            } catch (error) {
              // Skip malformed entities
            }

            inEntity = false;
            currentEntity = "";
          }
        }
      });

      rl.on("close", () => {
        console.log(`✅ Analysis complete!`);
        console.log(
          `📊 Total entities processed: ${totalProcessed.toLocaleString()}`
        );
        console.log(
          `🏢 Kommune ${targetKommune} companies found: ${kommuneCount.toLocaleString()}`
        );

        resolve(
          NextResponse.json({
            success: true,
            totalEntitiesProcessed: totalProcessed,
            kommuneCompaniesFound: kommuneCount,
            targetKommune,
            targetKommuneName,
            sampleCompanies: kommuneCompanies,
            message: `Found ${kommuneCount.toLocaleString()} companies in kommune ${targetKommune} out of ${totalProcessed.toLocaleString()} total entities`,
          })
        );
      });

      rl.on("error", (error) => {
        console.error("❌ Error reading file:", error);
        resolve(
          NextResponse.json(
            {
              success: false,
              error: error.message,
            },
            { status: 500 }
          )
        );
      });
    });
  } catch (error) {
    console.error("❌ Error in kommune analysis:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
