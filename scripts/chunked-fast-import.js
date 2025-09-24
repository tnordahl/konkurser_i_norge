const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const prisma = new PrismaClient();

async function chunkedFastImport() {
  // Get command line arguments for range
  const args = process.argv.slice(2);
  const startFrom = parseInt(args[0]) || 0;
  const endAt = parseInt(args[1]) || 100000;
  const chunkSize = endAt - startFrom;

  console.log(
    `🚀 Starting CHUNKED FAST import (${startFrom.toLocaleString()} to ${endAt.toLocaleString()})...`
  );
  console.log(
    `📦 Processing ${chunkSize.toLocaleString()} entities in this chunk`
  );

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
  let skipped = 0;

  // FAST batches for this chunk
  const batchSize = 5000; // 5K entities per batch
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
    let entityCount = 0; // Track entities found in file

    console.log(
      `📖 Reading file and processing entities ${startFrom.toLocaleString()} to ${endAt.toLocaleString()}...`
    );

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
              entityCount++;

              // Skip entities before our start range
              if (entityCount <= startFrom) {
                skipped++;
                insideEntity = false;
                currentEntity = "";
                continue;
              }

              // Stop if we've reached our end range
              if (entityCount > endAt) {
                console.log(
                  `🎯 Reached target range end (${endAt.toLocaleString()}), stopping...`
                );
                break;
              }

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

                  // Prepare address history data
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

                  // Process FAST batches
                  if (companyBuffer.length >= batchSize) {
                    const batchResult = await processFastBatch(
                      companyBuffer,
                      addressBuffer
                    );
                    totalSaved += batchResult.saved;
                    totalErrors += batchResult.errors;

                    const rate = Math.round(
                      totalProcessed / ((Date.now() - startTime) / 1000)
                    );
                    const progress = Math.round(
                      (totalProcessed / chunkSize) * 100
                    );
                    console.log(
                      `⚡ CHUNKED-FAST: Processed ${totalProcessed.toLocaleString()}/${chunkSize.toLocaleString()} (${progress}%) - ${totalSaved.toLocaleString()} saved, ${totalErrors} errors - ${rate} entities/second`
                    );

                    // Clear buffers
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

      // Break if we've reached our target
      if (entityCount > endAt) break;
    }

    // Process remaining entities
    if (companyBuffer.length > 0) {
      const batchResult = await processFastBatch(companyBuffer, addressBuffer);
      totalSaved += batchResult.saved;
      totalErrors += batchResult.errors;
    }

    const totalTime = Date.now() - startTime;
    const rate = Math.round(totalProcessed / (totalTime / 1000));

    console.log(
      `\n✅ CHUNKED-FAST import completed in ${Math.round(totalTime / 1000)}s`
    );
    console.log(
      `📊 Range: ${startFrom.toLocaleString()} to ${endAt.toLocaleString()}`
    );
    console.log(`📦 Total processed: ${totalProcessed.toLocaleString()}`);
    console.log(`💾 Total saved: ${totalSaved.toLocaleString()}`);
    console.log(`⏭️  Total skipped: ${skipped.toLocaleString()}`);
    console.log(`❌ Total errors: ${totalErrors}`);
    console.log(`🚀 Processing rate: ${rate} entities/second`);
    console.log(
      `📈 Success rate: ${Math.round((totalSaved / totalProcessed) * 100)}%`
    );

    // Show next command
    const nextStart = endAt;
    const nextEnd = endAt + chunkSize;
    console.log(`\n🔄 Next chunk command:`);
    console.log(
      `   node scripts/chunked-fast-import.js ${nextStart} ${nextEnd}`
    );

    // Show current database stats
    await showDatabaseStats();
  } catch (error) {
    console.error("❌ Import failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

async function processFastBatch(companies, addresses) {
  let saved = 0;
  let errors = 0;

  try {
    console.log(
      `🔥 Processing FAST batch: ${companies.length} companies, ${addresses.length} addresses`
    );

    // Batch insert companies with skipDuplicates
    const companyResult = await prisma.company.createMany({
      data: companies,
      skipDuplicates: true,
    });

    saved += companyResult.count;

    // Process addresses efficiently
    if (addresses.length > 0) {
      try {
        // Get company IDs in one query
        const orgNumbers = [
          ...new Set(addresses.map((addr) => addr.organizationNumber)),
        ];
        const companiesWithIds = await prisma.company.findMany({
          where: { organizationNumber: { in: orgNumbers } },
          select: { id: true, organizationNumber: true },
        });

        const orgToIdMap = new Map(
          companiesWithIds.map((c) => [c.organizationNumber, c.id])
        );

        // Add company IDs to address data
        const addressesWithIds = addresses
          .map((addr) => ({
            ...addr,
            companyId: orgToIdMap.get(addr.organizationNumber),
          }))
          .filter((addr) => addr.companyId);

        if (addressesWithIds.length > 0) {
          await prisma.companyAddressHistory.createMany({
            data: addressesWithIds,
            skipDuplicates: true,
          });
        }
      } catch (addressError) {
        console.error("Address batch error:", addressError.message);
        errors += addresses.length;
      }
    }
  } catch (error) {
    console.error("Fast batch error:", error.message);
    errors += companies.length;
  }

  return { saved, errors };
}

async function showDatabaseStats() {
  try {
    console.log(`\n📊 Current Database Stats:`);

    const companyCount = await prisma.company.count();
    const addressCount = await prisma.companyAddressHistory.count();
    const bankruptcyCount = await prisma.company.count({
      where: { status: "BANKRUPTCY" },
    });

    console.log(`   Companies: ${companyCount.toLocaleString()}`);
    console.log(`   Address History: ${addressCount.toLocaleString()}`);
    console.log(`   Bankruptcies: ${bankruptcyCount.toLocaleString()}`);

    // Estimate remaining
    const estimatedTotal = 1000000; // Rough estimate
    const remaining = Math.max(0, estimatedTotal - companyCount);
    console.log(`   Estimated Remaining: ${remaining.toLocaleString()}`);
  } catch (error) {
    console.error("❌ Stats error:", error);
  }
}

// Run the CHUNKED-FAST import
chunkedFastImport().catch(console.error);
