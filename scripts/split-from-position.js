const fs = require("fs");
const path = require("path");
const readline = require("readline");

async function splitFromPosition() {
  const args = process.argv.slice(2);
  const startFrom = parseInt(args[0]) || 300000; // Start from entity 300K
  const chunkSize = parseInt(args[1]) || 50000; // 50K entities per chunk
  const maxChunks = parseInt(args[2]) || 10; // Create max 10 chunks

  console.log(
    `🔪 Splitting JSON from position ${startFrom.toLocaleString()}...`
  );
  console.log(
    `📦 Creating ${maxChunks} chunks of ${chunkSize.toLocaleString()} entities each`
  );

  const inputPath = path.join(__dirname, "..", "assets", "enheter_alle.json");
  const outputDir = path.join(__dirname, "..", "assets", "chunks");

  if (!fs.existsSync(inputPath)) {
    console.error("❌ enheter_alle.json file not found");
    process.exit(1);
  }

  // Create chunks directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileStats = fs.statSync(inputPath);
  console.log(
    `📁 Input file size: ${Math.round(fileStats.size / (1024 * 1024))}MB`
  );

  let totalEntities = 0;
  let currentChunk = Math.floor(startFrom / chunkSize); // Start chunk numbering from correct position
  let entitiesInCurrentChunk = 0;
  let currentChunkEntities = [];
  let chunksCreated = 0;

  const startTime = Date.now();

  try {
    const fileStream = fs.createReadStream(inputPath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;
    let insideEntity = false;
    let currentEntity = "";
    let braceCount = 0;
    let entityCount = 0;

    console.log(
      `📖 Reading file and skipping to position ${startFrom.toLocaleString()}...`
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

              // Skip entities before our start position
              if (entityCount <= startFrom) {
                if (entityCount % 50000 === 0) {
                  console.log(
                    `⏭️  Skipped to entity ${entityCount.toLocaleString()}...`
                  );
                }
                insideEntity = false;
                currentEntity = "";
                continue;
              }

              // Stop if we've created enough chunks
              if (chunksCreated >= maxChunks) {
                console.log(`🎯 Created ${maxChunks} chunks, stopping...`);
                break;
              }

              try {
                const entity = JSON.parse(currentEntity);
                if (entity && entity.organisasjonsnummer) {
                  currentChunkEntities.push(entity);
                  entitiesInCurrentChunk++;
                  totalEntities++;

                  // Save chunk when it reaches the desired size
                  if (entitiesInCurrentChunk >= chunkSize) {
                    await saveChunk(
                      outputDir,
                      currentChunk,
                      currentChunkEntities
                    );

                    console.log(
                      `💾 Saved chunk ${currentChunk}: ${entitiesInCurrentChunk.toLocaleString()} entities (Total processed: ${totalEntities.toLocaleString()})`
                    );

                    // Reset for next chunk
                    currentChunk++;
                    entitiesInCurrentChunk = 0;
                    currentChunkEntities = [];
                    chunksCreated++;
                  }
                }
              } catch (parseError) {
                console.error(
                  `❌ Parse error at entity ${entityCount}:`,
                  parseError.message
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

      // Break if we've created enough chunks
      if (chunksCreated >= maxChunks) break;
    }

    // Save remaining entities in the last chunk
    if (currentChunkEntities.length > 0 && chunksCreated < maxChunks) {
      await saveChunk(outputDir, currentChunk, currentChunkEntities);
      console.log(
        `💾 Saved final chunk ${currentChunk}: ${currentChunkEntities.length.toLocaleString()} entities`
      );
      chunksCreated++;
    }

    const totalTime = Date.now() - startTime;
    const rate = Math.round(totalEntities / (totalTime / 1000));

    console.log(
      `\n✅ Targeted splitting completed in ${Math.round(totalTime / 1000)}s`
    );
    console.log(
      `📊 Total entities processed: ${totalEntities.toLocaleString()}`
    );
    console.log(`📦 Chunks created: ${chunksCreated}`);
    console.log(`🚀 Processing rate: ${rate} entities/second`);
    console.log(`📁 Chunks saved in: ${outputDir}`);

    // List created files
    console.log(`\n📋 New chunk files:`);
    const startChunk = Math.floor(startFrom / chunkSize);
    for (let i = startChunk; i < startChunk + chunksCreated; i++) {
      const chunkPath = path.join(
        outputDir,
        `chunk_${i.toString().padStart(3, "0")}.json`
      );
      if (fs.existsSync(chunkPath)) {
        const stats = fs.statSync(chunkPath);
        console.log(
          `   chunk_${i.toString().padStart(3, "0")}.json - ${Math.round(stats.size / (1024 * 1024))}MB`
        );
      }
    }

    console.log(`\n🎯 Import the new chunks:`);
    for (let i = startChunk; i < startChunk + chunksCreated; i++) {
      console.log(`   node scripts/import-chunk.js ${i}`);
    }
  } catch (error) {
    console.error("❌ Splitting failed:", error);
  }
}

async function saveChunk(outputDir, chunkNumber, entities) {
  const chunkPath = path.join(
    outputDir,
    `chunk_${chunkNumber.toString().padStart(3, "0")}.json`
  );
  const jsonContent = JSON.stringify(entities, null, 0); // No formatting to save space

  fs.writeFileSync(chunkPath, jsonContent, "utf8");
}

// Run the targeted splitter
splitFromPosition().catch(console.error);
