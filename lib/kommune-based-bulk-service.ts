/**
 * Kommune-Based Bulk Service - Bypass 10K API limit by searching per kommune
 *
 * Solution to API limitation: Instead of paginating through all entities,
 * search each kommune individually to access the complete dataset.
 */

import { prisma } from "./database";
import { delay } from "./config/api-delays";
import { kommuneService, Kommune } from "./kommune-service";
import { postalCodeService } from "./postal-code-service";

interface KommuneStats {
  kommuneNumber: string;
  kommuneName: string;
  totalEntities: number;
  downloadedEntities: number;
  processingTime: number;
  success: boolean;
  error?: string;
}

export class KommuneBasedBulkService {
  private static instance: KommuneBasedBulkService;

  static getInstance(): KommuneBasedBulkService {
    if (!KommuneBasedBulkService.instance) {
      KommuneBasedBulkService.instance = new KommuneBasedBulkService();
    }
    return KommuneBasedBulkService.instance;
  }

  /**
   * Download ALL Norwegian companies by iterating through each kommune
   * This bypasses the 10,000 result API limitation
   */
  async downloadCompleteDatasetByKommune(): Promise<{
    totalKommuner: number;
    successfulKommuner: number;
    totalEntitiesDownloaded: number;
    totalProcessingTime: number;
    kommuneStats: KommuneStats[];
    coverage: string;
  }> {
    console.log(
      "🚀 COMPLETE DATASET DOWNLOAD: Processing all Norwegian kommuner..."
    );

    const allKommuner = kommuneService.getAllKommuner();
    console.log(`📍 Processing all ${allKommuner.length} Norwegian kommuner`);

    return this.processKommuneList(allKommuner);
  }

  /**
   * Download all entities for a specific kommune
   */
  private async downloadKommuneEntities(kommuneNumber: string): Promise<any[]> {
    const allEntities: any[] = [];
    let page = 0;
    const pageSize = 5000;
    const startTime = Date.now();

    console.log(`🚀 [${new Date().toISOString()}] Starting download for kommune ${kommuneNumber}...`);

    while (true) {
      const pageStartTime = Date.now();
      const url = `https://data.brreg.no/enhetsregisteret/api/enheter?kommunenummer=${kommuneNumber}&size=${pageSize}&page=${page}`;

      console.log(`📥 [${new Date().toISOString()}] Fetching page ${page} for kommune ${kommuneNumber}...`);
      console.log(`🔗 URL: ${url}`);

      try {
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            "User-Agent": "konkurser-i-norge-kommune-bulk/1.0",
          },
        });

        const fetchTime = Date.now() - pageStartTime;
        console.log(`⏱️ API request took ${fetchTime}ms`);

        if (!response.ok) {
          console.error(`❌ HTTP ${response.status} for kommune ${kommuneNumber} page ${page}`);
          console.error(`❌ Response headers:`, Object.fromEntries(response.headers.entries()));
          throw new Error(
            `Failed to download kommune ${kommuneNumber} page ${page}: ${response.status}`
          );
        }

        const parseStartTime = Date.now();
        const data = await response.json();
        const parseTime = Date.now() - parseStartTime;
        console.log(`⏱️ JSON parsing took ${parseTime}ms`);

        const entities = data._embedded?.enheter || [];

        console.log(`📊 [Page ${page}] API Response Summary:`);
        console.log(`  ├─ Entities in response: ${entities.length}`);
        console.log(`  ├─ Total pages available: ${data.page?.totalPages || 'unknown'}`);
        console.log(`  ├─ Total elements: ${data.page?.totalElements || 'unknown'}`);
        console.log(`  ├─ Current page size: ${data.page?.size || 'unknown'}`);
        console.log(`  └─ Page number: ${data.page?.number || 'unknown'}`);

        if (entities.length === 0) {
          console.log(`✅ [${new Date().toISOString()}] No more entities for kommune ${kommuneNumber} on page ${page}`);
          break; // No more results
        }

        // Log sample entity for debugging (only on first page)
        if (page === 0 && entities.length > 0) {
          const sample = entities[0];
          console.log(`📋 Sample entity from page ${page}:`);
          console.log(`  ├─ Org number: ${sample.organisasjonsnummer}`);
          console.log(`  ├─ Name: ${sample.navn}`);
          console.log(`  ├─ Business address: ${JSON.stringify(sample.forretningsadresse)}`);
          console.log(`  ├─ Postal address: ${JSON.stringify(sample.postadresse)}`);
          console.log(`  └─ Bankruptcy: ${sample.konkurs || false}`);
        }

        allEntities.push(...entities);
        const totalTime = Date.now() - startTime;
        const avgTimePerEntity = totalTime / allEntities.length;
        
        console.log(`📊 [Progress] Downloaded ${entities.length} entities from page ${page}`);
        console.log(`  ├─ Total entities so far: ${allEntities.length}`);
        console.log(`  ├─ Total time elapsed: ${Math.round(totalTime / 1000)}s`);
        console.log(`  ├─ Average time per entity: ${Math.round(avgTimePerEntity)}ms`);
        console.log(`  └─ Entities per second: ${Math.round(allEntities.length / (totalTime / 1000))}`);

        // Check if we've hit the API limit or there are no more pages
        const totalPages = data.page?.totalPages || 0;
        const totalElements = data.page?.totalElements || 0;
        
        if (page >= totalPages - 1 || pageSize * (page + 2) > 10000) {
          console.log(`⚠️ [${new Date().toISOString()}] Stopping due to API limit or end of pages:`);
          console.log(`  ├─ Current page: ${page}`);
          console.log(`  ├─ Total pages: ${totalPages}`);
          console.log(`  ├─ Total elements available: ${totalElements}`);
          console.log(`  └─ API limit check: ${pageSize * (page + 2)} > 10000 = ${pageSize * (page + 2) > 10000}`);
          break;
        }

        page++;

        // Rate limiting between pages
        const delayMs = 1000; // Assuming 1 second delay
        console.log(`⏳ [${new Date().toISOString()}] Waiting ${delayMs}ms before next request (page ${page})...`);
        await delay.betweenBronnøysundCalls();

      } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] Error fetching page ${page} for kommune ${kommuneNumber}:`, error);
        throw error;
      }
    }

    const totalTime = Date.now() - startTime;
    console.log(`🎉 [${new Date().toISOString()}] Download complete for kommune ${kommuneNumber}:`);
    console.log(`  ├─ Total entities: ${allEntities.length}`);
    console.log(`  ├─ Total pages fetched: ${page + 1}`);
    console.log(`  ├─ Total time: ${Math.round(totalTime / 1000)}s`);
    console.log(`  ├─ Average entities per page: ${Math.round(allEntities.length / (page + 1))}`);
    console.log(`  └─ Overall rate: ${Math.round(allEntities.length / (totalTime / 1000))} entities/second`);
    
    return allEntities;
  }

  /**
   * Process and save entities for a kommune
   */
  private async processKommuneEntities(
    entities: any[],
    kommuneNumber: string
  ): Promise<number> {
    const batchSize = 100;
    let processedCount = 0;
    const processingStartTime = Date.now();

    console.log(`💾 [${new Date().toISOString()}] Starting to process ${entities.length} entities for kommune ${kommuneNumber}...`);

    for (let i = 0; i < entities.length; i += batchSize) {
      const batchStartTime = Date.now();
      const batch = entities.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(entities.length / batchSize);

      console.log(`📦 [${new Date().toISOString()}] Processing batch ${batchNumber}/${totalBatches} (${batch.length} entities)...`);
      console.log(`  └─ Progress: ${Math.round((i / entities.length) * 100)}% complete`);

      try {
        // First, ensure the kommune exists in the database
        const kommuneStartTime = Date.now();
        console.log(`🏘️ Ensuring kommune ${kommuneNumber} exists in database...`);
        await this.ensureKommuneExists(kommuneNumber);
        const kommuneTime = Date.now() - kommuneStartTime;
        console.log(`  └─ Kommune check took ${kommuneTime}ms`);

        const mappingStartTime = Date.now();
        const companyData = batch.map((entity) => ({
          organizationNumber: entity.organisasjonsnummer,
          name: entity.navn,
          organizationForm: entity.organisasjonsform?.kode,
          status: entity.konkurs ? "Bankruptcy" : "Active",
          registrationDate: entity.registreringsdatoEnhetsregisteret
            ? new Date(entity.registreringsdatoEnhetsregisteret)
            : undefined,
          industry: entity.naeringskode1?.beskrivelse,
          industryCode: entity.naeringskode1?.kode,
          // Store addresses as JSON objects for full data
          businessAddress: entity.forretningsadresse,
          postalAddress: entity.postadresse,
          // Also store formatted addresses for easy display
          currentAddress: this.formatAddress(entity.forretningsadresse),
          currentPostalCode: entity.forretningsadresse?.postnummer,
          currentCity: entity.forretningsadresse?.poststed,
          isBankrupt: entity.konkurs || false,
          riskScore: this.calculateRiskScore(entity),
          lastUpdated: new Date(),
          // Remove the problematic currentKommuneId for now - we'll add it separately
        }));
        const mappingTime = Date.now() - mappingStartTime;
        console.log(`  └─ Data mapping took ${mappingTime}ms`);

        console.log(`💾 [${new Date().toISOString()}] Saving batch ${batchNumber} to database...`);

        // Batch upsert with address history tracking
        const transactionStartTime = Date.now();
        await prisma.$transaction(async (tx) => {
          for (const [index, company] of companyData.entries()) {
            const companyStartTime = Date.now();
            
            // Only log every 10th company to reduce noise
            if (index % 10 === 0 || index === companyData.length - 1) {
              console.log(`  📝 [${index + 1}/${companyData.length}] Processing: ${company.organizationNumber} (${company.name})`);
            }
            
            // Upsert company
            const savedCompany = await tx.company.upsert({
              where: { organizationNumber: company.organizationNumber },
              update: company,
              create: company,
            });

            // Save address history for new companies or address changes
            const originalEntity = entities.find(
              (e) => e.organisasjonsnummer === company.organizationNumber
            );
            
            await this.saveAddressHistory(
              tx,
              savedCompany.id,
              company,
              originalEntity
            );

            const companyTime = Date.now() - companyStartTime;
            
            // Log timing for every 10th company
            if (index % 10 === 0 || index === companyData.length - 1) {
              console.log(`    └─ Company processing took ${companyTime}ms`);
            }
          }
        });
        
        const transactionTime = Date.now() - transactionStartTime;
        processedCount += batch.length;
        const batchTime = Date.now() - batchStartTime;
        const totalTime = Date.now() - processingStartTime;
        const avgTimePerBatch = totalTime / batchNumber;
        const estimatedTimeRemaining = avgTimePerBatch * (totalBatches - batchNumber);

        console.log(`✅ [${new Date().toISOString()}] Batch ${batchNumber} completed successfully:`);
        console.log(`  ├─ Entities processed: ${batch.length}`);
        console.log(`  ├─ Total processed: ${processedCount}/${entities.length}`);
        console.log(`  ├─ Batch time: ${Math.round(batchTime / 1000)}s`);
        console.log(`  ├─ Transaction time: ${Math.round(transactionTime / 1000)}s`);
        console.log(`  ├─ Avg time per entity: ${Math.round(batchTime / batch.length)}ms`);
        console.log(`  ├─ Progress: ${Math.round((processedCount / entities.length) * 100)}%`);
        console.log(`  └─ ETA: ${Math.round(estimatedTimeRemaining / 1000)}s remaining`);
        
      } catch (error) {
        console.error(`❌ [${new Date().toISOString()}] Failed to process batch ${batchNumber} for kommune ${kommuneNumber}:`, error);
        console.error(`   ├─ Batch contained ${batch.length} entities`);
        console.error(`   ├─ Error type: ${error instanceof Error ? error.constructor.name : typeof error}`);
        console.error(`   └─ Error details: ${error instanceof Error ? error.message : error}`);
      }
    }

    const totalProcessingTime = Date.now() - processingStartTime;
    console.log(`🎉 [${new Date().toISOString()}] Processing complete for kommune ${kommuneNumber}:`);
    console.log(`  ├─ Entities processed: ${processedCount}/${entities.length}`);
    console.log(`  ├─ Success rate: ${Math.round((processedCount / entities.length) * 100)}%`);
    console.log(`  ├─ Total time: ${Math.round(totalProcessingTime / 1000)}s`);
    console.log(`  ├─ Average per entity: ${Math.round(totalProcessingTime / processedCount)}ms`);
    console.log(`  └─ Processing rate: ${Math.round(processedCount / (totalProcessingTime / 1000))} entities/second`);
    
    // Collect postal codes for this kommune
    const postalStartTime = Date.now();
    console.log(`📮 [${new Date().toISOString()}] Collecting postal codes for kommune ${kommuneNumber}...`);
    try {
      await postalCodeService.collectPostalCodesForKommune(kommuneNumber);
      const postalTime = Date.now() - postalStartTime;
      console.log(`✅ [${new Date().toISOString()}] Postal codes collected for kommune ${kommuneNumber} (took ${postalTime}ms)`);
    } catch (error) {
      console.error(`❌ [${new Date().toISOString()}] Failed to collect postal codes for kommune ${kommuneNumber}:`, error);
    }
    
    return processedCount;
  }

  /**
   * Get all Norwegian kommune numbers
   */
  private async getAllKommuneNumbers(): Promise<
    Array<{ number: string; name: string }>
  > {
    const kommuner = kommuneService.getAllKommuner();
    console.log(`📍 Using complete kommune list: ${kommuner.length} kommuner`);

    return kommuner.map((k) => ({
      number: k.number,
      name: k.name,
    }));
  }

  /**
   * Get high-priority kommuner for initial testing
   */
  async downloadHighPriorityKommuner(): Promise<{
    totalKommuner: number;
    successfulKommuner: number;
    totalEntitiesDownloaded: number;
    totalProcessingTime: number;
    kommuneStats: KommuneStats[];
    coverage: string;
  }> {
    console.log(
      "🚀 HIGH-PRIORITY KOMMUNE DOWNLOAD: Starting with major cities..."
    );
    const startTime = Date.now();

    const highPriorityKommuner = kommuneService.getHighPriorityKommuner();
    console.log(
      `📍 Processing ${highPriorityKommuner.length} high-priority kommuner`
    );

    return this.processKommuneList(highPriorityKommuner);
  }

  /**
   * Process a list of kommuner
   */
  private async processKommuneList(kommuneList: Kommune[]): Promise<{
    totalKommuner: number;
    successfulKommuner: number;
    totalEntitiesDownloaded: number;
    totalProcessingTime: number;
    kommuneStats: KommuneStats[];
    coverage: string;
  }> {
    const startTime = Date.now();
    const kommuneStats: KommuneStats[] = [];
    let totalEntitiesDownloaded = 0;
    let successfulKommuner = 0;

    for (const kommune of kommuneList) {
      try {
        console.log(
          `\n🏘️ Processing ${kommune.priority} priority kommune ${kommune.number} (${kommune.name})`
        );

        const kommuneStartTime = Date.now();
        const entities = await this.downloadKommuneEntities(kommune.number);

        // Fix: Actually process and save the entities
        const processedCount = await this.processKommuneEntities(
          entities,
          kommune.number
        );

        const processingTime = Date.now() - kommuneStartTime;

        const stats: KommuneStats = {
          kommuneNumber: kommune.number,
          kommuneName: kommune.name,
          totalEntities: entities.length,
          downloadedEntities: processedCount, // This should now be > 0
          processingTime,
          success: true,
        };

        kommuneStats.push(stats);
        totalEntitiesDownloaded += entities.length;
        successfulKommuner++;

        console.log(
          `✅ ${kommune.name}: ${entities.length} entities downloaded, ${processedCount} saved to database`
        );

        // Rate limiting between kommuner
        await delay.betweenBronnøysundCalls();
      } catch (error) {
        console.error(`❌ Failed to process kommune ${kommune.number}:`, error);

        kommuneStats.push({
          kommuneNumber: kommune.number,
          kommuneName: kommune.name,
          totalEntities: 0,
          downloadedEntities: 0,
          processingTime: 0,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const totalProcessingTime = Date.now() - startTime;
    const coverage = `${((totalEntitiesDownloaded / 1139492) * 100).toFixed(2)}%`;

    console.log(`\n🎉 KOMMUNE PROCESSING COMPLETE!`);
    console.log(
      `📊 Total entities downloaded: ${totalEntitiesDownloaded.toLocaleString()}`
    );
    console.log(
      `📍 Successful kommuner: ${successfulKommuner}/${kommuneList.length}`
    );
    console.log(`📈 Dataset coverage: ${coverage}`);

    return {
      totalKommuner: kommuneList.length,
      successfulKommuner,
      totalEntitiesDownloaded,
      totalProcessingTime,
      kommuneStats,
      coverage,
    };
  }

  private formatAddress(address: any): string {
    if (!address) return "";

    const parts = [
      address.adresse?.[0],
      address.postnummer,
      address.poststed,
    ].filter(Boolean);

    return parts.join(", ");
  }

  /**
   * Ensure a kommune exists in the database
   */
  private async ensureKommuneExists(kommuneNumber: string): Promise<void> {
    try {
      await prisma.kommune.upsert({
        where: { kommuneNumber },
        update: {},
        create: {
          kommuneNumber,
          name: this.getKommuneName(kommuneNumber),
          county: "Unknown", // Would be filled from kommune service
        },
      });
    } catch (error) {
      console.error(`Failed to ensure kommune ${kommuneNumber} exists:`, error);
    }
  }

  /**
   * Get kommune name from service
   */
  private getKommuneName(kommuneNumber: string): string {
    const kommune = kommuneService
      .getAllKommuner()
      .find((k) => k.number === kommuneNumber);
    return kommune?.name || `Kommune ${kommuneNumber}`;
  }

  /**
   * Save address history for a company
   */
  private async saveAddressHistory(
    tx: any,
    companyId: string,
    companyData: any,
    originalEntity: any
  ): Promise<void> {
    try {
      const histories: any[] = [];

      // Business address
      if (originalEntity?.forretningsadresse) {
        const businessHistory = {
          companyId,
          organizationNumber: companyData.organizationNumber,
          address: this.formatAddress(originalEntity.forretningsadresse),
          postalCode: originalEntity.forretningsadresse.postnummer,
          city: originalEntity.forretningsadresse.poststed,
          kommuneNumber: originalEntity.forretningsadresse.kommunenummer,
          kommuneName: originalEntity.forretningsadresse.poststed,
          addressType: "business",
          fromDate: companyData.registrationDate || new Date(),
          isCurrentAddress: true,
        };
        histories.push(businessHistory);
      }

      // Postal address (if different from business address)
      if (
        originalEntity?.postadresse &&
        JSON.stringify(originalEntity.postadresse) !==
          JSON.stringify(originalEntity.forretningsadresse)
      ) {
        const postalHistory = {
          companyId,
          organizationNumber: companyData.organizationNumber,
          address: this.formatAddress(originalEntity.postadresse),
          postalCode: originalEntity.postadresse.postnummer,
          city: originalEntity.postadresse.poststed,
          kommuneNumber: originalEntity.postadresse.kommunenummer,
          kommuneName: originalEntity.postadresse.poststed,
          addressType: "postal",
          fromDate: companyData.registrationDate || new Date(),
          isCurrentAddress: true,
        };
        histories.push(postalHistory);
      }

      // Save address histories (reduced logging)
      for (const history of histories) {
        // Check if this address history already exists
        const existing = await tx.companyAddressHistory.findFirst({
          where: {
            companyId: history.companyId,
            addressType: history.addressType,
            isCurrentAddress: true,
          },
        });

        if (existing) {
          // Update existing record
          await tx.companyAddressHistory.update({
            where: { id: existing.id },
            data: history,
          });
        } else {
          // Create new record
          await tx.companyAddressHistory.create({
            data: history,
          });
        }
      }

    } catch (error) {
      console.error(`    ❌ Failed to save address history for ${companyData.organizationNumber}:`, error);
      // Don't throw - address history is supplementary data
    }
  }

  private calculateRiskScore(entity: any): number {
    let score = 0;

    if (entity.konkurs) score += 50;

    if (entity.registreringsdatoEnhetsregisteret) {
      const regDate = new Date(entity.registreringsdatoEnhetsregisteret);
      const daysSinceReg =
        (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceReg < 365) score += 20;
    }

    if (
      entity.forretningsadresse?.kommunenummer !==
      entity.postadresse?.kommunenummer
    ) {
      score += 15;
    }

    return Math.min(score, 100);
  }
}

export const kommuneBasedBulkService = KommuneBasedBulkService.getInstance();
