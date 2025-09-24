const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const prisma = new PrismaClient();

async function bulkImport() {
  console.log("🚀 Starting bulk import of Norwegian companies...");

  const filePath = path.join(__dirname, "..", "assets", "enheter_alle.json");

  if (!fs.existsSync(filePath)) {
    console.error("❌ enheter_alle.json file not found");
    process.exit(1);
  }

  const fileStats = fs.statSync(filePath);
  console.log(`📁 File size: ${Math.round(fileStats.size / (1024 * 1024))}MB`);

  let totalProcessed = 0;
  let totalSaved = 0;
  let totalErrors = 0;
  let batchBuffer = [];
  const batchSize = 1000;

  const startTime = Date.now();

  try {
    // Read file line by line
    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    let insideEntity = false;
    let currentEntity = "";
    let braceCount = 0;

    console.log("📖 Reading file line by line...");

    for await (const line of rl) {
      lineNumber++;

      // Skip array brackets
      if (lineNumber === 1 && line.trim() === "[") continue;
      if (line.trim() === "]") break;

      // Process each character to find complete JSON objects
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
                  batchBuffer.push(entity);
                  totalProcessed++;

                  // Process batch when full
                  if (batchBuffer.length >= batchSize) {
                    const batchResult = await processBatch(batchBuffer);
                    totalSaved += batchResult.saved;
                    totalErrors += batchResult.errors;

                    console.log(
                      `⚡ Processed ${totalProcessed} entities (${totalSaved} saved, ${totalErrors} errors)`
                    );
                    batchBuffer = [];
                  }
                }
              } catch (parseError) {
                totalErrors++;
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

    // Process remaining entities
    if (batchBuffer.length > 0) {
      const batchResult = await processBatch(batchBuffer);
      totalSaved += batchResult.saved;
      totalErrors += batchResult.errors;
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ Import completed in ${Math.round(totalTime / 1000)}s`);
    console.log(`📊 Total processed: ${totalProcessed}`);
    console.log(`💾 Total saved: ${totalSaved}`);
    console.log(`❌ Total errors: ${totalErrors}`);
    console.log(
      `📈 Success rate: ${Math.round((totalSaved / totalProcessed) * 100)}%`
    );
  } catch (error) {
    console.error("❌ Import failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

async function processBatch(entities) {
  let saved = 0;
  let errors = 0;

  for (const entity of entities) {
    try {
      if (!entity.organisasjonsnummer) {
        errors++;
        continue;
      }

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

      // Upsert company
      const company = await prisma.company.upsert({
        where: { organizationNumber: entity.organisasjonsnummer },
        update: companyData,
        create: companyData,
      });

      // Create address history entries using available date information
      const dates = {
        enhetsregisteret: entity.registreringsdatoEnhetsregisteret
          ? new Date(entity.registreringsdatoEnhetsregisteret)
          : null,
        foretaksregisteret: entity.registreringsdatoForetaksregisteret
          ? new Date(entity.registreringsdatoForetaksregisteret)
          : null,
        stiftelse: entity.stiftelsesdato
          ? new Date(entity.stiftelsesdato)
          : null,
        vedtekter: entity.vedtektsdato ? new Date(entity.vedtektsdato) : null,
      };

      // Use the earliest available date as the base registration date
      const baseDate =
        dates.stiftelse ||
        dates.foretaksregisteret ||
        dates.enhetsregisteret ||
        new Date();

      // Create address history entries for both addresses
      const addressEntries = [];

      // Business address (forretningsadresse) - use enhetsregisteret date or base date
      if (entity.forretningsadresse && entity.forretningsadresse.adresse) {
        const businessFromDate = dates.enhetsregisteret || baseDate;

        addressEntries.push({
          companyId: company.id,
          organizationNumber: entity.organisasjonsnummer,
          address: entity.forretningsadresse.adresse.join(", "),
          postalCode: entity.forretningsadresse.postnummer || "",
          city: entity.forretningsadresse.poststed || "",
          kommuneNumber: entity.forretningsadresse.kommunenummer || "",
          kommuneName: entity.forretningsadresse.kommune || "",
          addressType: "business",
          fromDate: businessFromDate,
          toDate: null,
          isCurrentAddress: true,
        });
      }

      // Postal address (postadresse) - always save if it exists
      if (entity.postadresse && entity.postadresse.adresse) {
        const postalAddress = entity.postadresse.adresse.join(", ");
        const businessAddress =
          entity.forretningsadresse?.adresse?.join(", ") || "";

        // Use foretaksregisteret date for postal address if different from business address
        const postalFromDate =
          postalAddress !== businessAddress && dates.foretaksregisteret
            ? dates.foretaksregisteret
            : dates.enhetsregisteret || baseDate;

        // Save postal address even if it's the same as business address
        // This preserves the complete address information from BRREG
        addressEntries.push({
          companyId: company.id,
          organizationNumber: entity.organisasjonsnummer,
          address: postalAddress,
          postalCode: entity.postadresse.postnummer || "",
          city: entity.postadresse.poststed || "",
          kommuneNumber: entity.postadresse.kommunenummer || "",
          kommuneName: entity.postadresse.kommune || "",
          addressType: "postal",
          fromDate: postalFromDate,
          toDate: null,
          isCurrentAddress: true,
        });
      }

      // If we have different registration dates, create historical entries
      if (
        dates.stiftelse &&
        dates.enhetsregisteret &&
        dates.stiftelse.getTime() !== dates.enhetsregisteret.getTime()
      ) {
        // Create a historical entry showing the company may have had different addresses
        // This is inferred from the fact that there are different registration dates
        if (entity.forretningsadresse && entity.forretningsadresse.adresse) {
          addressEntries.push({
            companyId: company.id,
            organizationNumber: entity.organisasjonsnummer,
            address: `${entity.forretningsadresse.adresse.join(", ")} (historical)`,
            postalCode: entity.forretningsadresse.postnummer || "",
            city: entity.forretningsadresse.poststed || "",
            kommuneNumber: entity.forretningsadresse.kommunenummer || "",
            kommuneName: entity.forretningsadresse.kommune || "",
            addressType: "business",
            fromDate: dates.stiftelse,
            toDate: dates.enhetsregisteret,
            isCurrentAddress: false,
          });
        }
      }

      // Batch create address history entries
      if (addressEntries.length > 0) {
        try {
          await prisma.companyAddressHistory.createMany({
            data: addressEntries,
            skipDuplicates: true,
          });
        } catch (addressError) {
          // If batch create fails, try individual creates
          for (const addressEntry of addressEntries) {
            try {
              await prisma.companyAddressHistory.create({
                data: addressEntry,
              });
            } catch (individualError) {
              // Skip duplicates silently
              if (!individualError.message.includes("Unique constraint")) {
                console.error(
                  `Address history error for ${entity.organisasjonsnummer}:`,
                  individualError.message
                );
              }
            }
          }
        }
      }

      saved++;
    } catch (error) {
      errors++;
      console.error(
        `Failed to process ${entity.organisasjonsnummer}:`,
        error.message
      );
    }
  }

  return { saved, errors };
}

// Run the import
bulkImport().catch(console.error);
