const fs = require("fs");
const path = require("path");
const readline = require("readline");

async function splitJsonFile() {
  const args = process.argv.slice(2);
  const chunkSize = parseInt(args[0]) || 50000; // 50K entities per file

  console.log(
    `🔪 Splitting JSON file into chunks of ${chunkSize.toLocaleString()} entities...`
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
  let currentChunk = 0;
  let entitiesInCurrentChunk = 0;
  let currentChunkEntities = [];

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

    console.log("📖 Reading and splitting file...");

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
                      `💾 Saved chunk ${currentChunk}: ${entitiesInCurrentChunk.toLocaleString()} entities (Total: ${totalEntities.toLocaleString()})`
                    );

                    // Reset for next chunk
                    currentChunk++;
                    entitiesInCurrentChunk = 0;
                    currentChunkEntities = [];
                  }

                  // Progress update
                  if (totalEntities % 10000 === 0) {
                    const rate = Math.round(
                      totalEntities / ((Date.now() - startTime) / 1000)
                    );
                    console.log(
                      `📊 Processed ${totalEntities.toLocaleString()} entities - ${rate} entities/second`
                    );
                  }
                }
              } catch (parseError) {
                console.error(
                  `❌ Parse error at entity ${totalEntities}:`,
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
    }

    // Save remaining entities in the last chunk
    if (currentChunkEntities.length > 0) {
      await saveChunk(outputDir, currentChunk, currentChunkEntities);
      console.log(
        `💾 Saved final chunk ${currentChunk}: ${currentChunkEntities.length.toLocaleString()} entities`
      );
    }

    const totalTime = Date.now() - startTime;
    const rate = Math.round(totalEntities / (totalTime / 1000));

    console.log(
      `\n✅ File splitting completed in ${Math.round(totalTime / 1000)}s`
    );
    console.log(`📊 Total entities: ${totalEntities.toLocaleString()}`);
    console.log(`📦 Total chunks: ${currentChunk + 1}`);
    console.log(`🚀 Processing rate: ${rate} entities/second`);
    console.log(`📁 Chunks saved in: ${outputDir}`);

    // List created files
    console.log(`\n📋 Created chunk files:`);
    for (let i = 0; i <= currentChunk; i++) {
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

    console.log(`\n🎯 Now you can import each chunk separately:`);
    console.log(`   node scripts/import-chunk.js 0`);
    console.log(`   node scripts/import-chunk.js 1`);
    console.log(`   node scripts/import-chunk.js 2`);
    console.log(`   ...etc`);
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

// Run the file splitter
splitJsonFile().catch(console.error);
