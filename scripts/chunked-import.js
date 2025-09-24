const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const prisma = new PrismaClient();

async function chunkedImport() {
  console.log("🚀 Starting CHUNKED import (restart-safe)...");
  
  const filePath = path.join(__dirname, "..", "assets", "enheter_alle.json");
  
  if (!fs.existsSync(filePath)) {
    console.error("❌ enheter_alle.json file not found");
    process.exit(1);
  }

  // Check current progress
  const currentCount = await prisma.company.count();
  console.log(`📊 Current companies in DB: ${currentCount}`);
  
  // If we have substantial data, ask if we should continue
  if (currentCount > 300000) {
    console.log("✅ We already have substantial data (300K+ companies)");
    console.log("🎯 This is enough for fraud detection testing!");
    console.log("💡 We can continue importing later if needed");
    
    // Test our current dataset
    await testCurrentDataset();
    return;
  }

  const fileStats = fs.statSync(filePath);
  console.log(`📁 File size: ${Math.round(fileStats.size / (1024 * 1024))}MB`);

  let totalProcessed = 0;
  let totalSaved = 0;
  let totalErrors = 0;
  let skipped = 0;
  
  // VERY SMALL batches to prevent any memory issues
  const batchSize = 500; // Even smaller!
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

    console.log("📖 Reading file with CHUNKED processing...");

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
                  
                  // Skip if we've already processed this (restart safety)
                  if (totalProcessed < currentCount) {
                    skipped++;
                    totalProcessed++;
                    insideEntity = false;
                    currentEntity = "";
                    continue;
                  }
                  
                  // Prepare minimal company data
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
                  
                  // Minimal address history
                  const registrationDate = entity.registreringsdatoEnhetsregisteret
                    ? new Date(entity.registreringsdatoEnhetsregisteret)
                    : new Date();

                  // Only business address to reduce memory
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

                  totalProcessed++;
                  
                  // Process TINY batches
                  if (companyBuffer.length >= batchSize) {
                    const batchResult = await processChunkedBatch(companyBuffer, addressBuffer);
                    totalSaved += batchResult.saved;
                    totalErrors += batchResult.errors;
                    
                    const rate = Math.round(totalProcessed / ((Date.now() - startTime) / 1000));
                    console.log(
                      `⚡ CHUNKED: Processed ${totalProcessed} entities (${totalSaved} saved, ${totalErrors} errors, ${skipped} skipped) - ${rate} entities/second`
                    );
                    
                    // Clear buffers and force cleanup
                    companyBuffer = [];
                    addressBuffer = [];
                    
                    // Force garbage collection
                    if (global.gc) {
                      global.gc();
                    }
                    
                    // Memory safety break - restart if we're getting close to limits
                    if (totalProcessed % 50000 === 0) {
                      console.log("🔄 Memory safety checkpoint - consider restarting script");
                      console.log(`📊 Progress: ${totalProcessed} processed, ${totalSaved} saved`);
                    }
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
      const batchResult = await processChunkedBatch(companyBuffer, addressBuffer);
      totalSaved += batchResult.saved;
      totalErrors += batchResult.errors;
    }

    const totalTime = Date.now() - startTime;
    const rate = Math.round(totalProcessed / (totalTime / 1000));
    
    console.log(`✅ CHUNKED import completed in ${Math.round(totalTime / 1000)}s`);
    console.log(`📊 Total processed: ${totalProcessed}`);
    console.log(`💾 Total saved: ${totalSaved}`);
    console.log(`⏭️  Total skipped: ${skipped}`);
    console.log(`❌ Total errors: ${totalErrors}`);
    console.log(`🚀 Processing rate: ${rate} entities/second`);

    await testCurrentDataset();

  } catch (error) {
    console.error("❌ Import failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

async function processChunkedBatch(companies, addresses) {
  let saved = 0;
  let errors = 0;

  try {
    console.log(`🔥 Processing CHUNKED batch: ${companies.length} companies, ${addresses.length} addresses`);
    
    // Batch insert companies
    const companyResult = await prisma.company.createMany({
      data: companies,
      skipDuplicates: true,
    });
    
    saved += companyResult.count;
    
    // Process addresses in tiny chunks
    if (addresses.length > 0) {
      try {
        // Get company IDs
        const orgNumbers = addresses.map((addr) => addr.organizationNumber);
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
        console.error("Address error:", addressError.message);
        errors += addresses.length;
      }
    }

  } catch (error) {
    console.error("Chunked batch error:", error.message);
    errors += companies.length;
  }

  return { saved, errors };
}

async function testCurrentDataset() {
  console.log("\n🧪 Testing current dataset...");
  
  try {
    const stats = await prisma.company.aggregate({
      _count: { id: true },
    });
    
    const bankruptcies = await prisma.company.count({
      where: { status: "BANKRUPTCY" }
    });
    
    const addressCount = await prisma.companyAddressHistory.count();
    
    console.log(`📊 Dataset Statistics:`);
    console.log(`   Companies: ${stats._count.id.toLocaleString()}`);
    console.log(`   Bankruptcies: ${bankruptcies.toLocaleString()}`);
    console.log(`   Address History: ${addressCount.toLocaleString()}`);
    
    // Test some fraud detection
    console.log("\n🔍 Testing fraud detection capabilities...");
    
    const risørCompanies = await prisma.company.count({
      where: {
        OR: [
          { currentCity: { contains: "Risør", mode: "insensitive" } },
          { currentAddress: { contains: "Risør", mode: "insensitive" } }
        ]
      }
    });
    
    console.log(`   Companies in/mentioning Risør: ${risørCompanies}`);
    
    if (risørCompanies > 0) {
      console.log("✅ We have enough data for fraud detection testing!");
      console.log("🎯 Ready to test organic movement detection!");
    }
    
  } catch (error) {
    console.error("❌ Dataset test failed:", error);
  }
}

// Run the CHUNKED import
chunkedImport().catch(console.error);
