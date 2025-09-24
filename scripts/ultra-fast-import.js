const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const prisma = new PrismaClient();

async function ultraFastImport() {
  console.log("🚀 Starting ULTRA-FAST bulk import of Norwegian companies...");

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

  // MUCH LARGER BATCHES for speed
  const batchSize = 10000; // 10K entities per batch
  let companyBuffer = [];
  let addressBuffer = [];

  const startTime = Date.now();

  try {
    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    let insideEntity = false;
    let currentEntity = "";
    let braceCount = 0;

    console.log("📖 Reading file line by line with ULTRA-FAST processing...");

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
                  // Prepare company data
                  const companyData = {
                    organizationNumber: entity.organisasjonsnummer,
                    name: entity.navn || "Ukjent navn",
                    organizationForm:
                      entity.organisasjonsform?.kode || "UKJENT",
                    registrationDate: entity.registreringsdatoEnhetsregisteret
                      ? new Date(entity.registreringsdatoEnhetsregisteret)
                      : new Date(),
                    status: entity.konkurs ? "BANKRUPTCY" : "ACTIVE",
                    industry:
                      entity.naeringskode1?.beskrivelse || "Ukjent bransje",
                    industryCode: entity.naeringskode1?.kode || "00.000",
                    currentAddress:
                      entity.forretningsadresse?.adresse?.join(", ") || "",
                    currentPostalCode:
                      entity.forretningsadresse?.postnummer || "",
                    currentCity: entity.forretningsadresse?.poststed || "",
                    businessAddress:
                      entity.forretningsadresse?.adresse?.join(", ") || "",
                    postalAddress:
                      entity.postadresse?.adresse?.join(", ") || "",
                    employeeCount: entity.antallAnsatte || 0,
                    lastUpdated: new Date(),
                  };

                  companyBuffer.push(companyData);

                  // Prepare address history data (simplified for speed)
                  const registrationDate =
                    entity.registreringsdatoEnhetsregisteret
                      ? new Date(entity.registreringsdatoEnhetsregisteret)
                      : new Date();

                  // Business address
                  if (
                    entity.forretningsadresse &&
                    entity.forretningsadresse.adresse
                  ) {
                    addressBuffer.push({
                      organizationNumber: entity.organisasjonsnummer,
                      address: entity.forretningsadresse.adresse.join(", "),
                      postalCode: entity.forretningsadresse.postnummer || "",
                      city: entity.forretningsadresse.poststed || "",
                      kommuneNumber:
                        entity.forretningsadresse.kommunenummer || "",
                      kommuneName: entity.forretningsadresse.kommune || "",
                      addressType: "business",
                      fromDate: registrationDate,
                      isCurrentAddress: true,
                    });
                  }

                  // Postal address (if different)
                  if (entity.postadresse && entity.postadresse.adresse) {
                    const postalAddr = entity.postadresse.adresse.join(", ");
                    const businessAddr =
                      entity.forretningsadresse?.adresse?.join(", ") || "";

                    if (postalAddr !== businessAddr) {
                      addressBuffer.push({
                        organizationNumber: entity.organisasjonsnummer,
                        address: postalAddr,
                        postalCode: entity.postadresse.postnummer || "",
                        city: entity.postadresse.poststed || "",
                        kommuneNumber: entity.postadresse.kommunenummer || "",
                        kommuneName: entity.postadresse.kommune || "",
                        addressType: "postal",
                        fromDate: registrationDate,
                        isCurrentAddress: true,
                      });
                    }
                  }

                  totalProcessed++;

                  // Process LARGE batches for maximum speed
                  if (companyBuffer.length >= batchSize) {
                    const batchResult = await processMegaBatch(
                      companyBuffer,
                      addressBuffer
                    );
                    totalSaved += batchResult.saved;
                    totalErrors += batchResult.errors;

                    const rate = Math.round(
                      totalProcessed / ((Date.now() - startTime) / 1000)
                    );
                    console.log(
                      `⚡ ULTRA-FAST: Processed ${totalProcessed} entities (${totalSaved} saved, ${totalErrors} errors) - ${rate} entities/second`
                    );

                    companyBuffer = [];
                    addressBuffer = [];
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
    if (companyBuffer.length > 0) {
      const batchResult = await processMegaBatch(companyBuffer, addressBuffer);
      totalSaved += batchResult.saved;
      totalErrors += batchResult.errors;
    }

    const totalTime = Date.now() - startTime;
    const rate = Math.round(totalProcessed / (totalTime / 1000));

    console.log(
      `✅ ULTRA-FAST import completed in ${Math.round(totalTime / 1000)}s`
    );
    console.log(`📊 Total processed: ${totalProcessed}`);
    console.log(`💾 Total saved: ${totalSaved}`);
    console.log(`❌ Total errors: ${totalErrors}`);
    console.log(`🚀 Processing rate: ${rate} entities/second`);
    console.log(
      `📈 Success rate: ${Math.round((totalSaved / totalProcessed) * 100)}%`
    );
  } catch (error) {
    console.error("❌ Import failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

async function processMegaBatch(companies, addresses) {
  let saved = 0;
  let errors = 0;

  try {
    // ULTRA-FAST: Use createMany with skipDuplicates instead of individual upserts
    console.log(
      `🔥 Processing MEGA batch: ${companies.length} companies, ${addresses.length} addresses`
    );

    // Batch insert companies
    const companyResult = await prisma.company.createMany({
      data: companies,
      skipDuplicates: true,
    });

    saved += companyResult.count;

    // We need to get company IDs for address history, so we'll do this in chunks
    const addressChunks = [];
    for (let i = 0; i < addresses.length; i += 1000) {
      addressChunks.push(addresses.slice(i, i + 1000));
    }

    for (const chunk of addressChunks) {
      try {
        // Get company IDs for this chunk
        const orgNumbers = chunk.map((addr) => addr.organizationNumber);
        const companiesWithIds = await prisma.company.findMany({
          where: { organizationNumber: { in: orgNumbers } },
          select: { id: true, organizationNumber: true },
        });

        const orgToIdMap = new Map(
          companiesWithIds.map((c) => [c.organizationNumber, c.id])
        );

        // Add company IDs to address data
        const addressesWithIds = chunk
          .map((addr) => ({
            ...addr,
            companyId: orgToIdMap.get(addr.organizationNumber),
          }))
          .filter((addr) => addr.companyId); // Only include addresses where we found the company

        if (addressesWithIds.length > 0) {
          await prisma.companyAddressHistory.createMany({
            data: addressesWithIds,
            skipDuplicates: true,
          });
        }
      } catch (addressError) {
        console.error("Address batch error:", addressError.message);
        errors += chunk.length;
      }
    }
  } catch (error) {
    console.error("Mega batch error:", error.message);
    errors += companies.length;
  }

  return { saved, errors };
}

// Run the ULTRA-FAST import
ultraFastImport().catch(console.error);
