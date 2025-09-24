import { PrismaClient } from "@prisma/client";
import fs from "fs";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { postalCodeService } from "./postal-code-service";
import { optimizedCompanyService } from "./optimized-company-service";

const prisma = new PrismaClient();

interface BrregEntity {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform: {
    kode: string;
    beskrivelse: string;
  };
  postadresse?: {
    land?: string;
    landkode?: string;
    postnummer?: string;
    poststed?: string;
    adresse?: string[];
    kommune?: string;
    kommunenummer?: string;
  };
  forretningsadresse?: {
    land?: string;
    landkode?: string;
    postnummer?: string;
    poststed?: string;
    adresse?: string[];
    kommune?: string;
    kommunenummer?: string;
  };
  registreringsdatoEnhetsregisteret?: string;
  registrertIMvaregisteret?: boolean;
  naeringskode1?: {
    beskrivelse?: string;
    kode?: string;
  };
  antallAnsatte?: number;
  konkurs?: boolean;
  underAvvikling?: boolean;
  underTvangsavviklingEllerTvangsopplosning?: boolean;
}

export class CompleteDatasetProcessor {
  private processingStatus = {
    isProcessing: false,
    currentFile: "",
    totalEntities: 0,
    processedEntities: 0,
    savedEntities: 0,
    errors: 0,
    startTime: null as Date | null,
    lastUpdate: new Date(),
    estimatedCompletion: null as Date | null,
  };

  async processCompleteDataset(filePath: string): Promise<{
    success: boolean;
    totalProcessed: number;
    totalSaved: number;
    errors: number;
    duration: number;
  }> {
    console.log(`🚀 Starting complete dataset processing: ${filePath}`);

    this.processingStatus.isProcessing = true;
    this.processingStatus.currentFile = filePath;
    this.processingStatus.startTime = new Date();
    this.processingStatus.totalEntities = 0;
    this.processingStatus.processedEntities = 0;
    this.processingStatus.savedEntities = 0;
    this.processingStatus.errors = 0;

    try {
      // First, count total entities for progress tracking
      await this.countTotalEntities(filePath);

      // Process the file in streaming fashion
      await this.streamProcessFile(filePath);

      const duration = Date.now() - this.processingStatus.startTime!.getTime();

      console.log(`✅ Complete dataset processing finished!`);
      console.log(
        `📊 Total processed: ${this.processingStatus.processedEntities}`
      );
      console.log(`💾 Total saved: ${this.processingStatus.savedEntities}`);
      console.log(`❌ Errors: ${this.processingStatus.errors}`);
      console.log(`⏱️ Duration: ${Math.round(duration / 1000)}s`);

      this.processingStatus.isProcessing = false;

      return {
        success: true,
        totalProcessed: this.processingStatus.processedEntities,
        totalSaved: this.processingStatus.savedEntities,
        errors: this.processingStatus.errors,
        duration: Math.round(duration / 1000),
      };
    } catch (error) {
      console.error("❌ Error processing complete dataset:", error);
      this.processingStatus.isProcessing = false;
      throw error;
    }
  }

  private async countTotalEntities(filePath: string): Promise<void> {
    console.log("📊 Counting total entities...");

    return new Promise((resolve, reject) => {
      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let count = 0;
      let inArray = false;

      rl.on("line", (line) => {
        const trimmed = line.trim();
        if (trimmed === "[") {
          inArray = true;
        } else if (trimmed.startsWith("{") && inArray) {
          count++;
        }
      });

      rl.on("close", () => {
        this.processingStatus.totalEntities = count;
        console.log(`📊 Total entities to process: ${count.toLocaleString()}`);
        resolve();
      });

      rl.on("error", reject);
    });
  }

  private async streamProcessFile(filePath: string): Promise<void> {
    console.log("🔄 Starting streaming processing...");

    return new Promise((resolve, reject) => {
      const fileStream = createReadStream(filePath);
      const rl = createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      let currentEntity = "";
      let braceCount = 0;
      let inEntity = false;
      let batch: BrregEntity[] = [];
      const batchSize = 1000;

      rl.on("line", async (line) => {
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
              const entity = JSON.parse(cleanEntity) as BrregEntity;
              batch.push(entity);

              if (batch.length >= batchSize) {
                rl.pause(); // Pause reading while processing batch
                await this.processBatch(batch);
                batch = [];
                rl.resume(); // Resume reading
              }
            } catch (error) {
              console.error("❌ Error parsing entity:", error);
              this.processingStatus.errors++;
            }

            inEntity = false;
            currentEntity = "";
          }
        }
      });

      rl.on("close", async () => {
        // Process remaining batch
        if (batch.length > 0) {
          await this.processBatch(batch);
        }
        resolve();
      });

      rl.on("error", reject);
    });
  }

  private async processBatch(entities: BrregEntity[]): Promise<void> {
    try {
      const companies = entities.map((entity) =>
        this.transformToCompany(entity)
      );

      // Use transaction for batch insert
      await prisma.$transaction(async (tx) => {
        for (const company of companies) {
          if (company) {
            try {
              await tx.company.upsert({
                where: { organizationNumber: company.organizationNumber },
                update: {
                  name: company.name,
                  organizationForm: company.organizationForm,
                  currentAddress: company.currentAddress,
                  currentPostalCode: company.currentPostalCode,
                  currentCity: company.currentCity,
                  currentKommuneNumber: company.currentKommuneNumber,
                  businessAddress: company.businessAddress,
                  businessPostalCode: company.businessPostalCode,
                  businessCity: company.businessCity,
                  businessKommuneNumber: company.businessKommuneNumber,
                  registrationDate: company.registrationDate,
                  isVatRegistered: company.isVatRegistered,
                  primaryIndustryCode: company.primaryIndustryCode,
                  primaryIndustryDescription:
                    company.primaryIndustryDescription,
                  employeeCount: company.employeeCount,
                  isBankrupt: company.isBankrupt,
                  isUnderLiquidation: company.isUnderLiquidation,
                  isUnderForcedLiquidation: company.isUnderForcedLiquidation,
                  riskScore: company.riskScore,
                  lastUpdated: new Date(),
                },
                create: company,
              });

              this.processingStatus.savedEntities++;
            } catch (error) {
              console.error(
                `❌ Error saving company ${company.organizationNumber}:`,
                error
              );
              this.processingStatus.errors++;
            }
          }
        }
      });

      this.processingStatus.processedEntities += entities.length;

      // Log progress every 10,000 entities
      if (this.processingStatus.processedEntities % 10000 === 0) {
        const progress =
          (this.processingStatus.processedEntities /
            this.processingStatus.totalEntities) *
          100;
        const elapsed = Date.now() - this.processingStatus.startTime!.getTime();
        const rate = this.processingStatus.processedEntities / (elapsed / 1000);
        const remaining =
          this.processingStatus.totalEntities -
          this.processingStatus.processedEntities;
        const eta = remaining / rate;

        console.log(
          `📈 Progress: ${this.processingStatus.processedEntities.toLocaleString()}/${this.processingStatus.totalEntities.toLocaleString()} (${progress.toFixed(1)}%)`
        );
        console.log(
          `💾 Saved: ${this.processingStatus.savedEntities.toLocaleString()}`
        );
        console.log(`⚡ Rate: ${Math.round(rate)} entities/sec`);
        console.log(`⏱️ ETA: ${Math.round(eta / 60)} minutes`);
        console.log("---");

        this.processingStatus.lastUpdate = new Date();
        this.processingStatus.estimatedCompletion = new Date(
          Date.now() + eta * 1000
        );
      }
    } catch (error) {
      console.error("❌ Error processing batch:", error);
      this.processingStatus.errors += entities.length;
    }
  }

  private transformToCompany(entity: BrregEntity): any | null {
    if (!entity.organisasjonsnummer || !entity.navn) {
      return null;
    }

    const postAddress = entity.postadresse;
    const businessAddress = entity.forretningsadresse;

    return {
      organizationNumber: entity.organisasjonsnummer,
      name: entity.navn,
      organizationForm: entity.organisasjonsform?.beskrivelse || "Unknown",

      // Postal address (primary)
      currentAddress: postAddress?.adresse?.join(", ") || null,
      currentPostalCode: postAddress?.postnummer || null,
      currentCity: postAddress?.poststed || null,
      currentKommuneNumber: postAddress?.kommunenummer || null,

      // Business address
      businessAddress: businessAddress?.adresse?.join(", ") || null,
      businessPostalCode: businessAddress?.postnummer || null,
      businessCity: businessAddress?.poststed || null,
      businessKommuneNumber: businessAddress?.kommunenummer || null,

      registrationDate: entity.registreringsdatoEnhetsregisteret
        ? new Date(entity.registreringsdatoEnhetsregisteret)
        : null,
      isVatRegistered: entity.registrertIMvaregisteret || false,

      primaryIndustryCode: entity.naeringskode1?.kode || null,
      primaryIndustryDescription: entity.naeringskode1?.beskrivelse || null,

      employeeCount: entity.antallAnsatte || null,

      // Bankruptcy and liquidation status
      isBankrupt: entity.konkurs || false,
      isUnderLiquidation: entity.underAvvikling || false,
      isUnderForcedLiquidation:
        entity.underTvangsavviklingEllerTvangsopplosning || false,

      riskScore: this.calculateRiskScore(entity),

      createdAt: new Date(),
      lastUpdated: new Date(),
    };
  }

  private calculateRiskScore(entity: BrregEntity): number {
    let score = 0;

    // Bankruptcy indicators
    if (entity.konkurs) score += 100;
    if (entity.underAvvikling) score += 80;
    if (entity.underTvangsavviklingEllerTvangsopplosning) score += 90;

    // Missing critical information
    if (!entity.postadresse?.postnummer) score += 10;
    if (!entity.naeringskode1) score += 5;

    // Very low employee count might indicate shell company
    if (entity.antallAnsatte === 0) score += 15;

    return Math.min(score, 100);
  }

  getProcessingStatus() {
    return {
      ...this.processingStatus,
      progressPercentage:
        this.processingStatus.totalEntities > 0
          ? (this.processingStatus.processedEntities /
              this.processingStatus.totalEntities) *
            100
          : 0,
    };
  }

  async downloadLatestDataset(): Promise<string> {
    console.log(
      "📥 Downloading latest complete dataset from Brønnøysundregistrene..."
    );

    const url = "https://data.brreg.no/enhetsregisteret/api/enheter/lastned";
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `assets/enheter_alle_${timestamp}.json`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle gzipped response
      let data: string;
      if (response.headers.get("content-encoding") === "gzip") {
        const { createGunzip } = await import("zlib");
        const { pipeline } = await import("stream/promises");
        const gunzip = createGunzip();

        // Stream and decompress
        await pipeline(response.body!, gunzip, fs.createWriteStream(filename));
        console.log(`✅ Downloaded and decompressed to: ${filename}`);
      } else {
        data = await response.text();
        fs.writeFileSync(filename, data);
        console.log(`✅ Downloaded to: ${filename}`);
      }

      return filename;
    } catch (error) {
      console.error("❌ Error downloading dataset:", error);
      throw error;
    }
  }
}

export const completeDatasetProcessor = new CompleteDatasetProcessor();
