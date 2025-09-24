const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

const prisma = new PrismaClient();

async function importChunk() {
  const args = process.argv.slice(2);
  const chunkNumber = parseInt(args[0]);

  if (isNaN(chunkNumber)) {
    console.error(
      "❌ Please specify chunk number: node scripts/import-chunk.js 0"
    );
    process.exit(1);
  }

  console.log(`🚀 Starting import of chunk ${chunkNumber}...`);

  const chunkPath = path.join(
    __dirname,
    "..",
    "assets",
    "chunks",
    `chunk_${chunkNumber.toString().padStart(3, "0")}.json`
  );

  if (!fs.existsSync(chunkPath)) {
    console.error(`❌ Chunk file not found: ${chunkPath}`);
    process.exit(1);
  }

  const fileStats = fs.statSync(chunkPath);
  console.log(
    `📁 Chunk file size: ${Math.round(fileStats.size / (1024 * 1024))}MB`
  );

  let totalProcessed = 0;
  let totalSaved = 0;
  let totalErrors = 0;

  const batchSize = 2000; // Smaller batches for safety
  let companyBuffer = [];
  let addressBuffer = [];

  const startTime = Date.now();

  try {
    // Read the entire chunk file (it's small now)
    console.log("📖 Reading chunk file...");
    const chunkContent = fs.readFileSync(chunkPath, "utf8");
    const entities = JSON.parse(chunkContent);

    console.log(
      `📦 Found ${entities.length.toLocaleString()} entities in chunk ${chunkNumber}`
    );

    for (const entity of entities) {
      if (entity && entity.organisasjonsnummer) {
        // Prepare company data
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

        companyBuffer.push(companyData);

        // Prepare address history data
        const registrationDate = entity.registreringsdatoEnhetsregisteret
          ? new Date(entity.registreringsdatoEnhetsregisteret)
          : new Date();

        // Business address
        if (entity.forretningsadresse && entity.forretningsadresse.adresse) {
          addressBuffer.push({
            organizationNumber: entity.organisasjonsnummer,
            address: entity.forretningsadresse.adresse.join(", "),
            postalCode: entity.forretningsadresse.postnummer || "",
            city: entity.forretningsadresse.poststed || "",
            kommuneNumber: entity.forretningsadresse.kommunenummer || "",
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

        // Process batches
        if (companyBuffer.length >= batchSize) {
          const batchResult = await processChunkBatch(
            companyBuffer,
            addressBuffer
          );
          totalSaved += batchResult.saved;
          totalErrors += batchResult.errors;

          const rate = Math.round(
            totalProcessed / ((Date.now() - startTime) / 1000)
          );
          const progress = Math.round((totalProcessed / entities.length) * 100);
          console.log(
            `⚡ CHUNK-${chunkNumber}: Processed ${totalProcessed.toLocaleString()}/${entities.length.toLocaleString()} (${progress}%) - ${totalSaved.toLocaleString()} saved, ${totalErrors} errors - ${rate} entities/second`
          );

          // Clear buffers
          companyBuffer = [];
          addressBuffer = [];
        }
      }
    }

    // Process remaining entities
    if (companyBuffer.length > 0) {
      const batchResult = await processChunkBatch(companyBuffer, addressBuffer);
      totalSaved += batchResult.saved;
      totalErrors += batchResult.errors;
    }

    const totalTime = Date.now() - startTime;
    const rate = Math.round(totalProcessed / (totalTime / 1000));

    console.log(
      `\n✅ Chunk ${chunkNumber} import completed in ${Math.round(totalTime / 1000)}s`
    );
    console.log(`📊 Total processed: ${totalProcessed.toLocaleString()}`);
    console.log(`💾 Total saved: ${totalSaved.toLocaleString()}`);
    console.log(`❌ Total errors: ${totalErrors}`);
    console.log(`🚀 Processing rate: ${rate} entities/second`);
    console.log(
      `📈 Success rate: ${Math.round((totalSaved / totalProcessed) * 100)}%`
    );

    // Show current database stats
    await showDatabaseStats();

    // Show next chunk command
    const nextChunk = chunkNumber + 1;
    const nextChunkPath = path.join(
      __dirname,
      "..",
      "assets",
      "chunks",
      `chunk_${nextChunk.toString().padStart(3, "0")}.json`
    );
    if (fs.existsSync(nextChunkPath)) {
      console.log(`\n🔄 Next chunk command:`);
      console.log(`   node scripts/import-chunk.js ${nextChunk}`);
    } else {
      console.log(`\n🎉 All chunks completed! No more chunk files found.`);
    }
  } catch (error) {
    console.error("❌ Import failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

async function processChunkBatch(companies, addresses) {
  let saved = 0;
  let errors = 0;

  try {
    console.log(
      `🔥 Processing batch: ${companies.length} companies, ${addresses.length} addresses`
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
    console.error("Chunk batch error:", error.message);
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
  } catch (error) {
    console.error("❌ Stats error:", error);
  }
}

// Run the chunk import
importChunk().catch(console.error);
